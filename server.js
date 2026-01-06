import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pkg from "pg";
import bcrypt from "bcrypt";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { sendCodeEmail, sendVerificationCode, verifyCode } from "./email-auth.js";
import fs from "fs";
import path from "path";

dotenv.config();

// Para diagnosticar despliegues en EasyPanel: si no ves un build_id consistente en /api/health,
// el servicio puede estar corriendo un build viejo o con env vars mal seteadas.
const normalizeBuildId = (v) => {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const low = s.toLowerCase();
  if (low === "undefined" || low === "null") return "";
  return s;
};

const APP_BUILD_ID =
  normalizeBuildId(process.env.APP_BUILD_ID) ||
  normalizeBuildId(process.env.EASYPANEL_GIT_SHA) ||
  normalizeBuildId(process.env.GIT_SHA) ||
  normalizeBuildId(process.env.GIT_COMMIT) ||
  normalizeBuildId(process.env.COMMIT_SHA) ||
  normalizeBuildId(process.env.SOURCE_VERSION) ||
  "unknown";

const APP_STARTED_AT = new Date().toISOString();

const app = express();
app.use(cors());
app.use(
  express.json({
    limit: "50mb",
    verify: (req, _res, buf) => {
      // Needed for Meta webhook signature verification
      req.rawBody = buf;
    },
  })
);

// ===== FRONTEND (Vite build en /dist) =====
const distDir = path.resolve(process.cwd(), "dist");
const distIndexHtml = path.join(distDir, "index.html");
const hasFrontendBuild = fs.existsSync(distIndexHtml);

if (hasFrontendBuild) {
  app.use(express.static(distDir));
}

// ===== CLIENT PORTAL (seguro): sesión por código =====
// N12|ota: esto es in-memory (en producción: Redis/DB). Suficiente para dev/local.
const clientLoginPending = new Map(); // key: "asegId:dni" -> { email, createdAt }
const clientLoginCooldown = new Map(); // key: "asegId:dni" -> lastSentMs

const jwtSecret = process.env.JWT_SECRET || "secret_key_development";

// ===== EMAIL CODES (DB-backed, production-safe) =====
const normalizeEmailLower = (v) => String(v || "").trim().toLowerCase();

const hashEmailCode = ({ email, purpose, code }) => {
  const e = normalizeEmailLower(email);
  const p = String(purpose || "").trim();
  const c = String(code || "").trim();
  return crypto
    .createHmac("sha256", String(jwtSecret || ""))
    .update(`${p}|${e}|${c}`)
    .digest("hex");
};

const ensureEmailCodesTable = async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS email_verification_codes (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL,
      purpose TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      code_plain TEXT,
      expires_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  // Compat: DBs existentes pueden no tener la columna.
  await pool.query("ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS code_plain TEXT").catch(() => {});
  await pool.query(
    "CREATE INDEX IF NOT EXISTS ix_email_verification_codes_purpose_expires ON email_verification_codes(purpose, expires_at)"
  );
};

const createEmailCodeAndSend = async ({ email, purpose }) => {
  const emailNorm = normalizeEmailLower(email);
  const p = String(purpose || "").trim();
  if (!emailNorm || !emailNorm.includes("@")) throw new Error("Email inválido");
  if (!p) throw new Error("purpose requerido");

  // Cooldown persistente: si ya existe un código vigente creado hace <60s,
  // lo re-enviamos para evitar generar múltiples códigos distintos.
  try {
    const last = await pool.query(
      "SELECT code_plain, expires_at, created_at FROM email_verification_codes WHERE purpose = $1 ORDER BY id DESC LIMIT 1",
      [p]
    );
    const row = last.rows?.[0];
    if (row?.expires_at && row?.created_at) {
      const exp = new Date(row.expires_at);
      const created = new Date(row.created_at);
      const stillValid = exp instanceof Date && !isNaN(exp.getTime()) && exp.getTime() > Date.now();
      const withinCooldown = created instanceof Date && !isNaN(created.getTime()) && Date.now() - created.getTime() < 60_000;
      const existingCode = String(row.code_plain || "").trim();
      if (stillValid && withinCooldown && existingCode) {
        await sendCodeEmail(emailNorm, existingCode);
        return { expiresAt: exp, reused: true };
      }
    }
  } catch {
    // no bloquear el flujo por problemas de cooldown
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
  const codeHash = hashEmailCode({ email: emailNorm, purpose: p, code });

  await pool.query("DELETE FROM email_verification_codes WHERE purpose = $1", [p]);
  await pool.query(
    "INSERT INTO email_verification_codes (email, purpose, code_hash, code_plain, expires_at) VALUES ($1, $2, $3, $4, $5)",
    [emailNorm, p, codeHash, code, expiresAt]
  );

  await sendCodeEmail(emailNorm, code);
  return { expiresAt, reused: false };
};

const verifyEmailCodeByPurpose = async ({ purpose, code }) => {
  const p = String(purpose || "").trim();
  const cRaw = String(code || "").trim();
  const c = cRaw.replace(/[^\d]/g, "");
  if (!p) return { valid: false, message: "Primero pedí el código", reason: "missing_purpose" };
  if (!c) return { valid: false, message: "Código requerido", reason: "missing_code" };

  const safePurpose = (() => {
    try {
      // purpose esperado: "client:<asegId>:<dni>" | "aseg_login:<email>"
      const parts = p.split(":");
      if (parts[0] === "client") {
        const aseg = parts[1] || "?";
        const dni = String(parts[2] || "");
        const last = dni ? dni.slice(-3) : "";
        return `client:${aseg}:***${last}`;
      }
      if (parts[0] === "aseg_login") return "aseg_login:***";
      return "purpose:***";
    } catch {
      return "purpose:***";
    }
  })();

  // Verificamos contra los últimos N códigos vigentes (evita fallos por emails fuera de orden / reintentos)
  const r = await pool.query(
    "SELECT id, email, code_hash, code_plain, expires_at FROM email_verification_codes WHERE purpose = $1 ORDER BY id DESC LIMIT 5",
    [p]
  );
  const rows = Array.isArray(r.rows) ? r.rows : [];
  if (rows.length === 0) {
    console.log("[EMAIL_CODE_VERIFY_FAIL] not_found", { purpose: safePurpose });
    return { valid: false, message: "Primero pedí el código", reason: "not_found" };
  }

  let hasAnyUnexpired = false;
  let matched = null;

  for (const row of rows) {
    const exp = new Date(row.expires_at);
    const isUnexpired = exp instanceof Date && !isNaN(exp.getTime()) && exp.getTime() > Date.now();
    if (!isUnexpired) continue;
    hasAnyUnexpired = true;

    const plain = String(row.code_plain || "").trim();
    const plainDigits = plain.replace(/[^\d]/g, "");
    if (plain && plainDigits === c) {
      matched = row;
      break;
    }

    // Fallback para filas viejas sin code_plain
    if (!plain) {
      const expected = String(row.code_hash || "");
      const got = hashEmailCode({ email: row.email, purpose: p, code: c });
      if (expected && expected === got) {
        matched = row;
        break;
      }
    }
  }

  if (!hasAnyUnexpired) {
    await pool.query("DELETE FROM email_verification_codes WHERE purpose = $1", [p]);
    console.log("[EMAIL_CODE_VERIFY_FAIL] expired", { purpose: safePurpose });
    return { valid: false, message: "Código expirado", reason: "expired" };
  }

  if (!matched) {
    console.log("[EMAIL_CODE_VERIFY_FAIL] mismatch_plain", {
      purpose: safePurpose,
      code_len: c.length,
    });
    return { valid: false, message: "Código incorrecto", reason: "mismatch" };
  }

  await pool.query("DELETE FROM email_verification_codes WHERE purpose = $1", [p]);
  return { valid: true, message: "Código verificado", email: matched.email };
};

const getAuthUserIdFromReq = (req) => {
  const token = req.headers.authorization?.split(" ")?.[1];
  if (!token || token === "null" || token === "undefined") return null;
  try {
    const decoded = jwt.verify(token, jwtSecret);
    return decoded?.usuario_id || decoded?.id || null;
  } catch {
    return null;
  }
};

const byteaToBuffer = (v) => {
  if (!v) return null;
  if (Buffer.isBuffer(v)) return v;
  // a veces pg puede devolver bytea como string hex "\\x..."
  if (typeof v === "string") {
    const s = v.trim();
    if (s.startsWith("\\x")) {
      try {
        return Buffer.from(s.slice(2), "hex");
      } catch {
        return null;
      }
    }
  }
  return null;
};

const getProfilePhotoDataUrlFromUserRow = (userRow) => {
  try {
    const mime = String(userRow?.profile_photo_mime || "").trim();
    const buf = byteaToBuffer(userRow?.profile_photo);
    if (!mime || !buf) return null;
    const b64 = buf.toString("base64");
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
};

const maskEmail = (email) => {
  const s = String(email || "").trim();
  const at = s.indexOf("@");
  if (at <= 1) return "***";
  const user = s.slice(0, at);
  const domain = s.slice(at + 1);
  const u1 = user[0];
  return `${u1}•••@${domain}`;
};

// Healthchecks / landing (evita "Cannot GET /")
app.get("/", (req, res) => {
  if (hasFrontendBuild) {
    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.sendFile(distIndexHtml);
  }

  res.json({ status: "success", message: "Backend SegurosPro OK", time: new Date().toISOString() });
});

app.get("/health", (req, res) => {
  res.json({
    status: "success",
    ok: true,
    time: new Date().toISOString(),
    started_at: APP_STARTED_AT,
    build_id: APP_BUILD_ID,
    db_connected: dbConnected,
    email_codes_mode: dbConnected ? "db" : "mem",
  });
});

const { Pool } = pkg;

// ======== MULTI-TENANT (OPCIÓN C: 1 DB por aseguradora) ========
const MASTER_DB_NAME = process.env.DB_NAME || "cogniseguros";
const TENANT_DB_PREFIX = process.env.TENANT_DB_PREFIX || "cogniseguros_tenant_";
const tenantPools = new Map();

// Pool admin (para CREATE DATABASE). Debe conectarse a una DB existente.
const adminPool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_ADMIN_DB || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

const getTenantDbNameForUserId = (userId) => `${TENANT_DB_PREFIX}${userId}`;

// Para lookup de clientes: NO crear tenants nuevos; solo usar DBs existentes.
const getExistingTenantPoolForUserId = async (userId) => {
  const id = Number(userId);
  if (!Number.isFinite(id)) return null;

  // asegurar columna tenant_db
  await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tenant_db TEXT");

  const r = await pool.query("SELECT id, tenant_db FROM usuarios WHERE id = $1", [id]);
  if (r.rows.length === 0) return null;

  const dbName = r.rows[0].tenant_db || getTenantDbNameForUserId(id);

  // si la DB no existe, no la creamos acá
  const exists = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rows.length === 0) return null;

  const tenantPool = getOrCreateTenantPoolByDbName(dbName);

  // asegurar schema mínimo si falta la tabla (por seguridad)
  try {
    await tenantPool.query("SELECT 1 FROM clientes LIMIT 1");
  } catch {
    try {
      const schemaSql = loadTenantSchemaSql();
      await tenantPool.query(schemaSql);
    } catch {
      return null;
    }
  }

  return { tenantPool, tenantDb: dbName };
};

const getOrCreateTenantPoolByDbName = (dbName) => {
  if (tenantPools.has(dbName)) return tenantPools.get(dbName);
  const p = new Pool({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: dbName,
    password: process.env.DB_PASSWORD || "postgres",
    port: process.env.DB_PORT || 5432,
  });
  tenantPools.set(dbName, p);
  return p;
};

const loadTenantSchemaSql = () => {
  try {
    const schemaPath = path.resolve(process.cwd(), "tenant-schema.sql");
    return fs.readFileSync(schemaPath, "utf8");
  } catch {
    // Fallback mínimo (no debería pasar)
    return `
      CREATE TABLE IF NOT EXISTS clientes (
        id SERIAL PRIMARY KEY,
        fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        nombre VARCHAR(255) NOT NULL,
        apellido VARCHAR(255),
        mail VARCHAR(255),
        telefono VARCHAR(20),
        documento VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }
};

const ensureTenantDbExists = async (dbName) => {
  // Ver si existe
  const exists = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
  if (exists.rows.length === 0) {
    try {
      const safeDbName = String(dbName).replace(/"/g, '""');
      await adminPool.query(`CREATE DATABASE "${safeDbName}"`);
      console.log(`🧩 Tenant DB creada: ${dbName}`);
    } catch (err) {
      // 42P04 = duplicate_database
      // 23505 = unique_violation (pg_database_datname_index) puede ocurrir por carrera
      if (err.code !== "42P04" && err.code !== "23505") throw err;
    }
  }

  // Aplicar schema
  const tenantPool = getOrCreateTenantPoolByDbName(dbName);
  const schemaSql = loadTenantSchemaSql();
  await tenantPool.query(schemaSql);
};

const ensureTenantForUserId = async (userId) => {
  // 1) asegurar columna tenant_db
  await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tenant_db TEXT");

  // 2) obtener/definir db
  const r = await pool.query("SELECT id, tenant_db FROM usuarios WHERE id = $1", [userId]);
  if (r.rows.length === 0) throw new Error("Usuario no encontrado");

  let tenantDb = r.rows[0].tenant_db;
  if (!tenantDb) {
    tenantDb = getTenantDbNameForUserId(userId);
    await pool.query("UPDATE usuarios SET tenant_db = $1 WHERE id = $2", [tenantDb, userId]);
  }

  // 3) crear DB + schema
  await ensureTenantDbExists(tenantDb);

  // 4) migrar clientes desde master -> tenant si el tenant está vacío
  const tenantPool = getOrCreateTenantPoolByDbName(tenantDb);
  // Tenant DB vieja: si la tabla ya existía sin columna `pais`, CREATE TABLE IF NOT EXISTS no la agrega.
  // Aseguramos columnas e índice antes de leer/insertar.
  await ensureTenantClientesPaisSchema(tenantPool);
  await ensureTenantWhatsAppInboxSchema(tenantPool);
  const countTenant = await tenantPool.query("SELECT COUNT(*)::int AS c FROM clientes");
  if ((countTenant.rows[0]?.c ?? 0) === 0) {
    try {
      const { rows: masterClients } = await pool.query(
        "SELECT nombre, apellido, email, telefono, cedula FROM clientes WHERE usuario_id = $1 ORDER BY id ASC",
        [userId]
      );

      if (masterClients.length > 0) {
        for (const c of masterClients) {
          const documento = String(c.cedula || "").trim();
          await tenantPool.query(
            `INSERT INTO clientes (pais, nombre, apellido, mail, telefono, documento)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (pais, documento) DO UPDATE SET
               nombre = EXCLUDED.nombre,
               apellido = EXCLUDED.apellido,
               mail = EXCLUDED.mail,
               telefono = EXCLUDED.telefono,
               updated_at = NOW()`,
            ["AR", c.nombre || "", c.apellido || "", c.email || "", c.telefono || "", documento]
          );
        }
        console.log(`📦 Migrados ${masterClients.length} clientes a tenant ${tenantDb} (user ${userId})`);
      }
    } catch (err) {
      console.log("⚠️ No se pudo migrar clientes a tenant:", err.message);
    }
  }

  return { tenantDb, tenantPool };
};

const normalizePais = (pais) => {
  const p = String(pais || "AR").trim().toUpperCase();
  return p === "UY" ? "UY" : "AR";
};

const normalizePaisList = (paisesRaw, fallbackPais = "AR") => {
  const fallback = normalizePais(fallbackPais);
  const parts = String(paisesRaw || "")
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => normalizePais(x));

  const uniq = [];
  for (const p of parts) {
    if (!uniq.includes(p)) uniq.push(p);
  }

  if (uniq.length === 0) return fallback;
  // Guardamos canonical como "AR,UY" (sin espacios)
  return uniq.join(",");
};

const ensureUsuariosPaisSchema = async () => {
  try {
    await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR'");
    await pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS paises TEXT");
    await pool.query("UPDATE usuarios SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''");
    await pool.query("UPDATE usuarios SET paises = pais WHERE paises IS NULL OR TRIM(paises) = ''");
  } catch {
    // ignore
  }
};

const ensureInvitacionesPaisSchema = async () => {
  try {
    // Invitaciones puede existir en DBs viejas sin estos campos.
    await pool.query("ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS pais VARCHAR(2)");
    await pool.query("ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS paises TEXT");
    // Backfill para que no queden vacíos si se decide usarlos.
    await pool.query("UPDATE invitaciones SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''");
    await pool.query("UPDATE invitaciones SET paises = COALESCE(NULLIF(TRIM(paises), ''), pais) WHERE paises IS NULL OR TRIM(paises) = ''");
  } catch {
    // ignore
  }
};

const getPaisForAseguradoraId = async (aseguradoraId) => {
  try {
    await ensureUsuariosPaisSchema();
    const r = await pool.query("SELECT pais FROM usuarios WHERE id = $1", [Number(aseguradoraId)]);
    return normalizePais(r.rows[0]?.pais);
  } catch (err) {
    // Si la columna no existe aún (DB vieja), migrar y reintentar una vez.
    if (String(err?.code) === "42703" || /column\s+\"pais\"\s+does not exist/i.test(String(err?.message || ""))) {
      try {
        await ensureUsuariosPaisSchema();
        const r2 = await pool.query("SELECT pais FROM usuarios WHERE id = $1", [Number(aseguradoraId)]);
        return normalizePais(r2.rows[0]?.pais);
      } catch {
        return "AR";
      }
    }
    return "AR";
  }
};

const getAllowedPaisesForAseguradoraId = async (aseguradoraId) => {
  try {
    await ensureUsuariosPaisSchema();
    const r = await pool.query("SELECT pais, paises FROM usuarios WHERE id = $1", [Number(aseguradoraId)]);
    const row = r.rows[0] || {};
    const fallbackPais = normalizePais(row.pais);
    const canonical = normalizePaisList(row.paises, fallbackPais);
    const parts = String(canonical)
      .split(/[,;\s]+/)
      .map((x) => normalizePais(x))
      .filter((x) => x === "AR" || x === "UY");
    const uniq = Array.from(new Set(parts));
    return uniq.length ? uniq : [fallbackPais];
  } catch (err) {
    // Si la columna no existe aún (DB vieja), migrar y reintentar una vez.
    if (String(err?.code) === "42703" || /column\s+\"pais\"\s+does not exist/i.test(String(err?.message || ""))) {
      try {
        await ensureUsuariosPaisSchema();
        const r2 = await pool.query("SELECT pais, paises FROM usuarios WHERE id = $1", [Number(aseguradoraId)]);
        const row2 = r2.rows[0] || {};
        const fallbackPais2 = normalizePais(row2.pais);
        const canonical2 = normalizePaisList(row2.paises, fallbackPais2);
        const parts2 = String(canonical2)
          .split(/[,;\s]+/)
          .map((x) => normalizePais(x))
          .filter((x) => x === "AR" || x === "UY");
        const uniq2 = Array.from(new Set(parts2));
        return uniq2.length ? uniq2 : [fallbackPais2];
      } catch {
        return ["AR"];
      }
    }
    return ["AR"];
  }
};

const ensureTenantClientesPaisSchema = async (tenantPool) => {
  try {
    await tenantPool.query("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR'");

    // Default seguro
    await tenantPool.query("UPDATE clientes SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''");

    // Heurística simple para datos existentes:
    // si el teléfono parece de Uruguay (prefijo 598), marcamos UY.
    // Esto es clave para que el front pueda mostrar 'Cédula' y estilo celeste.
    await tenantPool.query(
      `UPDATE clientes
       SET pais = 'UY'
       WHERE (pais IS NULL OR TRIM(pais) = '' OR pais = 'AR')
         AND (
           REPLACE(REPLACE(REPLACE(COALESCE(telefono,''), ' ', ''), '-', ''), '+', '') LIKE '598%'
           OR COALESCE(telefono,'') LIKE '+598%'
         )`
    );

    await tenantPool.query("DROP INDEX IF EXISTS ux_clientes_documento");
    await tenantPool.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pais_documento ON clientes(pais, documento)");
  } catch (err) {
    console.log("⚠️ No se pudo asegurar schema clientes.pais:", err?.message || err);
  }
};

const ensureTenantWhatsAppInboxSchema = async (tenantPool) => {
  try {
    await tenantPool.query(
      `CREATE TABLE IF NOT EXISTS whatsapp_conversations (
        id BIGSERIAL PRIMARY KEY,
        wa_contact VARCHAR(64) NOT NULL,
        phone VARCHAR(32) NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        last_message_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    await tenantPool.query(
      "CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_conversations_wa_contact ON whatsapp_conversations(wa_contact)"
    );

    await tenantPool.query(
      `CREATE TABLE IF NOT EXISTS whatsapp_messages (
        id BIGSERIAL PRIMARY KEY,
        conversation_id BIGINT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
        direction VARCHAR(8) NOT NULL CHECK (direction IN ('in','out')),
        wa_message_id VARCHAR(128),
        from_phone VARCHAR(32) NOT NULL,
        to_phone VARCHAR(32) NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        wa_timestamp BIGINT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`
    );
    await tenantPool.query(
      // Nota: usamos índice UNIQUE no-parcial para permitir ON CONFLICT(wa_message_id)
      "CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_messages_wa_message_id_full ON whatsapp_messages(wa_message_id)"
    );
    await tenantPool.query(
      "CREATE INDEX IF NOT EXISTS ix_whatsapp_messages_conversation_created_at ON whatsapp_messages(conversation_id, created_at)"
    );
  } catch (err) {
    console.log("⚠️ No se pudo asegurar schema WhatsApp inbox:", err?.message || err);
  }
};

const requireAdminAccess = async (req) => {
  // Standard access (JWT + rol=admin)
  const token = req.headers.authorization?.split(" ")?.[1];
  if (!token || token === "null" || token === "undefined") {
    return { ok: false, status: 401, message: "No autorizado" };
  }

  let decoded;
  try {
    decoded = jwt.verify(token, jwtSecret);
  } catch {
    return { ok: false, status: 401, message: "Token inválido" };
  }

  const user = await db.query("SELECT rol FROM usuarios WHERE id = $1", [decoded.usuario_id]);
  if (!user.rows[0] || user.rows[0].rol !== "admin") {
    return { ok: false, status: 403, message: "No eres admin" };
  }
  return { ok: true, mode: "jwt", usuario_id: decoded.usuario_id };
};

// Rate limit simple en memoria para login admin por password
const adminLoginAttempts = new Map(); // key: ip|email -> { count, firstAt }
const getClientIpForAuth = (req) => {
  try {
    const xf = req.headers["x-forwarded-for"];
    if (xf) {
      const first = String(xf).split(",")[0]?.trim();
      if (first) return first;
    }
    return String(req.ip || "").trim();
  } catch {
    return "";
  }
};

const checkRateLimitAdminLogin = (req, email) => {
  const ip = getClientIpForAuth(req) || "unknown";
  const key = `${ip}|${String(email || "").toLowerCase()}`;
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const max = 10;
  const cur = adminLoginAttempts.get(key);
  if (!cur) {
    adminLoginAttempts.set(key, { count: 1, firstAt: now });
    return { ok: true };
  }
  if (now - cur.firstAt > windowMs) {
    adminLoginAttempts.set(key, { count: 1, firstAt: now });
    return { ok: true };
  }
  if (cur.count >= max) {
    return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - cur.firstAt)) / 1000) };
  }
  cur.count += 1;
  adminLoginAttempts.set(key, cur);
  return { ok: true };
};

app.post("/api/admin/login-password", async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim();
    const password = String(req.body?.password || "");
    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "Email y password requeridos" });
    }

    const rl = checkRateLimitAdminLogin(req, email);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfterSec || 60));
      return res.status(429).json({ status: "error", message: "Demasiados intentos. Esperá y reintentá." });
    }

    const u = await pool.query(
      "SELECT id, nombre, email, password, rol, pais, paises FROM usuarios WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );
    const user = u.rows[0];
    if (!user || user.rol !== "admin") {
      return res.status(401).json({ status: "error", message: "Credenciales inválidas" });
    }
    if (!user.password) {
      return res.status(401).json({ status: "error", message: "El usuario no tiene password configurada" });
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      return res.status(401).json({ status: "error", message: "Credenciales inválidas" });
    }

    const token = jwt.sign(
      { usuario_id: user.id, rol: user.rol },
      jwtSecret,
      { expiresIn: "12h" }
    );

    return res.json({
      status: "success",
      token,
      user: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, pais: user.pais, paises: user.paises },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

const getTenantPoolFromReq = async (req) => {
  const raw = req.body?.aseguradora_id || req.query?.aseguradora_id || req.body?.scope_id;
  if (!raw) throw new Error("aseguradora_id requerido");
  const userId = Number(raw);
  if (!Number.isFinite(userId)) throw new Error("aseguradora_id inválido");
  const { tenantPool } = await ensureTenantForUserId(userId);
  await ensureTenantClientesPaisSchema(tenantPool);
  await ensureTenantWhatsAppInboxSchema(tenantPool);
  return tenantPool;
};

// ======== TEST USERS (para cuando no hay BD) ========
const testUsers = {
  "test@test.com": {
    id: 1,
    nombre: "Usuario Test",
    email: "test@test.com",
    password: "$2b$10$abcdefghijklmnopqrstuvwxyz", // hash de "123456"
    rol: "user",
    pais: "AR",
    paises: "AR",
  },
  "admin@test.com": {
    id: 2,
    nombre: "Admin",
    email: "admin@test.com",
    password: "$2b$10$abcdefghijklmnopqrstuvwxyz", // hash de "admin123"
    rol: "admin",
    pais: "AR",
    paises: "AR",
  },
};

// ======== DB CONNECTION ========
console.log("🧩 DB config:", {
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  database: MASTER_DB_NAME,
  user: process.env.DB_USER || "postgres",
});

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: MASTER_DB_NAME,
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

// Alias histórico: varios endpoints admin usan `db.query`.
const db = pool;

let dbConnected = false;
pool.on("error", (err) => {
  console.error("⚠️ Pool error (usando modo test):", err.message);
  dbConnected = false;
});

// Verificar conexión
pool.query("SELECT NOW()").then(() => {
  dbConnected = true;
  console.log("✅ PostgreSQL conectado");

  // Códigos por email persistentes (evita fallos por memoria/instancias)
  ensureEmailCodesTable().catch(() => {});

  // Asegurar columnas mínimas en master DB (migración liviana)
  pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR'").catch(() => {});
  pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS paises TEXT").catch(() => {});
  pool.query("UPDATE usuarios SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''").catch(() => {});
  pool.query("UPDATE usuarios SET paises = pais WHERE paises IS NULL OR TRIM(paises) = ''").catch(() => {});

  // Invitaciones: permitir setear pais/paises desde admin (DBs viejas no lo tienen)
  pool.query("ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS pais VARCHAR(2)").catch(() => {});
  pool.query("ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS paises TEXT").catch(() => {});
  pool.query("UPDATE invitaciones SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''").catch(() => {});
  pool.query("UPDATE invitaciones SET paises = COALESCE(NULLIF(TRIM(paises), ''), pais) WHERE paises IS NULL OR TRIM(paises) = ''").catch(() => {});

  // Foto de perfil (WhatsApp-style)
  pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_photo BYTEA").catch(() => {});
  pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT").catch(() => {});
  pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_photo_updated_at TIMESTAMP").catch(() => {});

  // WhatsApp Cloud: mapear phone_number_id -> aseguradora (para webhooks entrantes)
  pool.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS wpp_phone_number_id TEXT").catch(() => {});
  pool.query(
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_wpp_phone_number_id ON usuarios(wpp_phone_number_id) WHERE wpp_phone_number_id IS NOT NULL AND TRIM(wpp_phone_number_id) <> ''"
  ).catch(() => {});
}).catch((err) => {
  dbConnected = false;
  console.log("⚠️ PostgreSQL no disponible, usando usuarios de test");
  console.error("❌ PostgreSQL connect error:", err?.message || err);
});

// ===== PERFIL: FOTO =====
app.post("/api/user/profile-photo", async (req, res) => {
  try {
    if (!dbConnected) {
      return res.status(503).json({ status: "error", message: "DB no disponible" });
    }

    const userId = getAuthUserIdFromReq(req);
    if (!userId) {
      return res.status(401).json({ status: "error", message: "No autorizado" });
    }

    const dataUrl = String(req.body?.dataUrl || "").trim();
    if (!dataUrl) {
      return res.status(400).json({ status: "error", message: "dataUrl requerido" });
    }

    const m = dataUrl.match(/^data:(image\/(png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/i);
    if (!m) {
      return res.status(400).json({ status: "error", message: "Formato de imagen inválido (usa PNG/JPG/WEBP)" });
    }

    const mime = String(m[1]).toLowerCase();
    const base64 = m[3];
    const buf = Buffer.from(base64, "base64");

    const maxBytes = 1024 * 1024;
    if (buf.length > maxBytes) {
      return res.status(413).json({ status: "error", message: "Imagen muy grande (máx 1MB)" });
    }

    await pool.query(
      "UPDATE usuarios SET profile_photo = $1, profile_photo_mime = $2, profile_photo_updated_at = NOW() WHERE id = $3",
      [buf, mime, userId]
    );

    return res.json({
      status: "success",
      profile_photo_dataurl: `data:${mime};base64,${buf.toString("base64")}`,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ======== MIDDLEWARE: VALIDAR MEMBRESÍA =====
const checkMembership = async (req, res, next) => {
  try {
    const userId = req.body.aseguradora_id || req.query.aseguradora_id;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "aseguradora_id requerido" });
    }

    // Verificar que existe el usuario
    const userResult = await pool.query("SELECT id, rol FROM usuarios WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ status: "error", message: "Usuario no encontrado" });
    }

    // Si es admin, pasar
    if (userResult.rows[0].rol === "admin") {
      req.user = userResult.rows[0];
      return next();
    }

    // Verificar membresía activa
    const subResult = await pool.query(
      `SELECT s.*, p.nombre as plan_nombre FROM suscripciones s
       JOIN planes p ON s.plan_id = p.id
       WHERE s.aseguradora_id = $1 AND UPPER(s.estado) = 'ACTIVA' AND s.fecha_fin > NOW()`,
      [userId]
    );

    if (subResult.rows.length === 0) {
      return res.status(403).json({
        status: "error",
        message: "Membresía no activa o vencida. Contactá a soporte.",
      });
    }

    // Guardar datos en request para usar después
    req.user = userResult.rows[0];
    req.subscription = subResult.rows[0];
    next();
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
};

// ======== MIDDLEWARE: VERIFICAR PERMISO DE CARACTERÍSTICA =====
const checkFeature = (feature) => async (req, res, next) => {
  if (!req.subscription) {
    return res.status(403).json({ status: "error", message: "Membresía requerida" });
  }

  const plan = req.subscription;
  const featureMap = {
    whatsapp: "soporta_whatsapp",
    openai: "soporta_openai",
    api: "soporta_api_rest",
  };

  if (!plan[featureMap[feature]]) {
    return res.status(403).json({
      status: "error",
      message: `La característica '${feature}' no está disponible en tu plan. Upgrade a un plan superior.`,
    });
  }

  next();
};

// ======== MIDDLEWARE: AUDITORÍA =====
const logAudit = async (userId, accion, recurso, detalles = {}) => {
  try {
    await pool.query(
      `INSERT INTO auditoría (usuario_id, accion, recurso, detalles) 
       VALUES ($1, $2, $3, $4)`,
      [userId, accion, recurso, JSON.stringify(detalles)]
    );
  } catch (err) {
    console.error("Error logging audit:", err);
  }
};

// ======== HELPERS ========

const normalizeDigits = (v) => String(v || "").replace(/[^\d]/g, "");

const safeTrim = (v) => String(v ?? "").trim();

const maskMiddle = (s, keepStart = 4, keepEnd = 3) => {
  const str = String(s || "").trim();
  if (!str) return "";
  const a = Math.max(0, keepStart);
  const b = Math.max(0, keepEnd);
  if (str.length <= a + b) return "*".repeat(Math.max(6, str.length));
  return str.slice(0, a) + "••••••••" + str.slice(str.length - b);
};

const isProd = () => safeTrim(process.env.NODE_ENV || "") === "production";

const makeConfigError = (service, missingKeys, message) => {
  const e = new Error(message);
  e.statusCode = 503;
  e.code = "CONFIG_MISSING";
  e.service = String(service || "config");
  e.missing = Array.isArray(missingKeys) ? missingKeys : [];
  return e;
};

const toSafeApiErrorBody = (err) => {
  const body = { status: "error", message: err?.message || "Error" };
  if (err?.code === "CONFIG_MISSING") {
    body.code = "CONFIG_MISSING";
    body.service = err?.service;
    body.missing = Array.isArray(err?.missing) ? err.missing : [];
  }
  return body;
};

const resolveAseguradoraIdFromPhoneNumberId = async (phoneNumberId) => {
  const phoneId = safeTrim(phoneNumberId);
  if (!phoneId || !dbConnected) return null;
  try {
    const r = await pool.query("SELECT id FROM usuarios WHERE wpp_phone_number_id = $1 LIMIT 1", [phoneId]);
    const id = r.rows?.[0]?.id;
    return id != null ? Number(id) : null;
  } catch {
    return null;
  }
};

const requireAutomationKey = (req) => {
  // En desarrollo, no bloqueamos (para poder diagnosticar sin pelear con headers/keys)
  if (safeTrim(process.env.NODE_ENV || "") !== "production") return true;
  const expected = safeTrim(process.env.AUTOMATION_API_KEY || "");
  if (!expected) return true; // si no está configurado, no bloquea (dev)
  const got = safeTrim(req.headers["x-automation-key"] || "");
  return got === expected;
};

// ===== WhatsApp debug (in-memory) =====
const wppDebug = {
  webhookHits: [],
  sendAttempts: [],
};

const pushWppDebug = (key, item, max = 80) => {
  try {
    const arr = wppDebug[key];
    if (!Array.isArray(arr)) return;
    arr.push(item);
    while (arr.length > max) arr.shift();
  } catch {
    // ignore
  }
};

const sendWhatsAppText = async (req, { aseguradora_id, to, message }) => {
  const toNorm = safeTrim(to);
  const msgNorm = safeTrim(message);
  if (!aseguradora_id || !toNorm || !msgNorm) {
    throw new Error("Faltan aseguradora_id, to o message");
  }

  const creds = await resolveWhatsAppCredentialsForReq({
    body: { aseguradora_id },
    query: {},
    headers: req.headers || {},
  });

  const phoneId = safeTrim(creds.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID || "");
  const token = safeTrim(creds.token || process.env.WHATSAPP_ACCESS_TOKEN || "");
  if (!phoneId || !token) {
    const missing = [];
    if (!phoneId) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (!token) missing.push("WHATSAPP_ACCESS_TOKEN");
    throw makeConfigError(
      "whatsapp",
      missing,
      "WhatsApp no configurado. Guardá Phone Number ID y Access Token en Configuración (WhatsApp) o configurá WHATSAPP_PHONE_NUMBER_ID / WHATSAPP_ACCESS_TOKEN en EasyPanel y reiniciá."
    );
  }

  const url = `https://graph.facebook.com/v18.0/${phoneId}/messages`;

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: normalizeDigits(toNorm),
      type: "text",
      text: { body: String(msgNorm).slice(0, 4000) },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    const msg = data?.error?.message || "Error al enviar";
    pushWppDebug("sendAttempts", {
      at: new Date().toISOString(),
      aseguradora_id: Number(aseguradora_id),
      to: normalizeDigits(toNorm),
      ok: false,
      status: response.status,
      ms: Date.now() - startedAt,
      error: msg,
      error_type: data?.error?.type || null,
      error_code: data?.error?.code || null,
      error_subcode: data?.error?.error_subcode || null,
    });
    const e = new Error(msg);
    e.statusCode = response.status;
    throw e;
  }

  const messageId = data?.messages?.[0]?.id || null;

  pushWppDebug("sendAttempts", {
    at: new Date().toISOString(),
    aseguradora_id: Number(aseguradora_id),
    to: normalizeDigits(toNorm),
    ok: true,
    status: 200,
    ms: Date.now() - startedAt,
    message_id: messageId,
  });

  // Persist outgoing in inbox
  try {
    const tenantPool = await getTenantPoolFromReq({ body: { aseguradora_id }, query: {}, headers: {} });
    const waContact = normalizeDigits(toNorm);
    const saved = await upsertWppConversationAndInsertMessage(tenantPool, {
      waContact,
      phone: waContact,
      name: "",
      direction: "out",
      waMessageId: messageId,
      fromPhone: String(phoneId),
      toPhone: waContact,
      body: String(msgNorm).slice(0, 4000),
      waTimestamp: null,
    });
    if (saved?.message) {
      wppBroadcast(Number(aseguradora_id), {
        type: "wpp_message",
        conversation_id: saved.conversation.id,
        wa_contact: saved.conversation.wa_contact,
        direction: "out",
        body: saved.message.body,
        created_at: saved.message.created_at,
      });
    }
  } catch {
    // ignore
  }

  return { message_id: messageId };
};

const isTruthy = (v) => {
  const s = String(v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
};

const resolveWppAiAutoreplyEnabledForAseguradora = async (aseguradoraId) => {
  // Regla simple y segura: por defecto OFF. Se enciende con env o config.
  if (isTruthy(process.env.WPP_AI_AUTOREPLY)) return true;
  try {
    const tenantPool = await getTenantPoolFromReq({ body: { aseguradora_id: aseguradoraId }, query: {}, headers: {} });
    const r = await tenantPool.query(
      "SELECT value FROM configuracion WHERE key = $1 AND scope = 'ASEGURADORA' AND (scope_id = $2 OR scope_id IS NULL) ORDER BY scope_id DESC NULLS LAST LIMIT 1",
      ["wpp_ai_autoreply", String(aseguradoraId)]
    );
    return isTruthy(r.rows?.[0]?.value);
  } catch {
    return false;
  }
};

const buildWppAiSystemPrompt = () => {
  return (
    "Sos un asistente de atención al cliente de una aseguradora (Cogniseguros). " +
    "Respondés en español rioplatense neutro, sin emojis. " +
    "Pedí datos faltantes (DNI, patente, número de póliza, fecha, etc.) cuando haga falta. " +
    "Sé claro, breve y profesional. No inventes información ni prometas cosas que no podés garantizar. " +
    "Si el mensaje no es sobre seguros, redirigí con cortesía."
  );
};

const generateWppAiReply = async ({ apiKey, model, customerName, customerPhone, conversationContext, lastUserMessage }) => {
  const m = String(model || process.env.OPENAI_MODEL || "gpt-4o-mini").trim() || "gpt-4o-mini";

  const ctxLines = (conversationContext || [])
    .slice(-12)
    .map((x) => {
      const role = x.direction === "out" ? "ASEGURADORA" : "CLIENTE";
      return `${role}: ${String(x.body || "").trim()}`;
    })
    .filter(Boolean);

  const userContent =
    `Cliente: ${customerName || ""} (${customerPhone || ""})\n` +
    (ctxLines.length ? `Contexto (últimos mensajes):\n${ctxLines.join("\n")}\n\n` : "") +
    `Mensaje del cliente: ${String(lastUserMessage || "").trim()}\n\n` +
    "Respondé con un único mensaje listo para enviar por WhatsApp.";

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: m,
      temperature: 0.4,
      messages: [
        { role: "system", content: buildWppAiSystemPrompt() },
        { role: "user", content: userContent },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) {
    const msg = data?.error?.message || "OpenAI error";
    const e = new Error(msg);
    e.statusCode = resp.status;
    throw e;
  }

  const text = String(data?.choices?.[0]?.message?.content || "").trim();
  return text;
};

const maybeAutoReplyFromWebhook = async ({ aseguradoraId, waFrom, name, bodyText, conversationId }) => {
  try {
    const enabled = await resolveWppAiAutoreplyEnabledForAseguradora(aseguradoraId);
    if (!enabled) return;

    const apiKey = await resolveOpenAiApiKeyForReq({ body: { aseguradora_id: aseguradoraId, scope: "ASEGURADORA", scope_id: aseguradoraId } });
    const looksPlaceholder =
      !apiKey ||
      /tu[_-]?openai/i.test(apiKey) ||
      /_aqui$/i.test(apiKey) ||
      /^YOUR_/i.test(apiKey);
    if (looksPlaceholder) return;

    const tenantPool = await getTenantPoolFromReq({ body: { aseguradora_id: aseguradoraId }, query: {}, headers: {} });
    const ctx = await tenantPool.query(
      `SELECT direction, body
       FROM whatsapp_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [Number(conversationId)]
    );

    const reply = await generateWppAiReply({
      apiKey,
      customerName: name,
      customerPhone: waFrom,
      conversationContext: ctx.rows || [],
      lastUserMessage: bodyText,
    });

    const finalReply = String(reply || "").trim();
    if (!finalReply) return;

    // Enviar por WhatsApp Cloud y persistir en inbox
    await sendWhatsAppText({ headers: {} }, { aseguradora_id: aseguradoraId, to: waFrom, message: finalReply });
  } catch (err) {
    console.error("[wpp-ai] autoreply error:", err?.message || err);
  }
};

const calcularDiasRestantes = (fechaFinStr) => {
  const s = String(fechaFinStr || "").trim();
  if (!s) return "";
  const dateOnly = s.includes("T") ? s.split("T")[0] : s;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return "";

  const parts = dateOnly.split("-").map((n) => parseInt(n, 10));
  const fin = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0));
  const hoy = new Date();
  const hoyUTC = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), hoy.getUTCDate(), 0, 0, 0));
  const diffMs = fin.getTime() - hoyUTC.getTime();
  const dias = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  return isFinite(dias) ? String(dias) : "";
};

// ======== HELPER: GENERAR CÓDIGO 2FA =====
const generarCodigo2FA = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// ======== HELPER: ENVIAR EMAIL (simplificado - usar SendGrid/Mailgun en producción) =====
const enviarEmail = async (email, asunto, codigo) => {
  // TODO: Integrar con SendGrid o Mailgun
  console.log(`📧 Email to ${email}: ${asunto} - Código: ${codigo}`);
  return true;
};

// ======== HELPER: ENVIAR SMS (simplificado - usar Twilio en producción) =====
const enviarSMS = async (telefono, codigo) => {
  // TODO: Integrar con Twilio
  console.log(`📱 SMS to ${telefono}: Tu código 2FA es: ${codigo}`);
  return true;
};

// ======== RUTAS ========

app.get("/api/health", (req, res) => {
  res.json({
    status: "success",
    message: "SegurosPro Backend ONLINE",
    started_at: APP_STARTED_AT,
    build_id: APP_BUILD_ID,
    db_connected: dbConnected,
    email_codes_mode: dbConnected ? "db" : "mem",
  });
});

app.post("/api/ping", (req, res) => {
  res.json({ status: "success", message: "pong" });
});

// ===== AUTH: LOGIN PASO 1 (email/password) =====
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ status: "error", message: "Email y password requeridos" });
    }

    let user = null;

    // Intentar BD primero
    if (dbConnected) {
      try {
        const result = await pool.query("SELECT * FROM usuarios WHERE LOWER(email) = LOWER($1)", [email]);
        user = result.rows[0];
      } catch (err) {
        console.log("Error DB, usando test users:", err.message);
      }
    }

    // Si no hay BD o usuario no encontrado, usar test users
    if (!user && testUsers[email.toLowerCase()]) {
      user = testUsers[email.toLowerCase()];
    }

    if (!user) {
      return res.status(401).json({ status: "error", message: "Credenciales incorrectas" });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ status: "error", message: "Credenciales incorrectas" });
    }

    // Generar JWT
    const token = jwt.sign(
      { usuario_id: user.id, email: user.email, rol: user.rol },
      jwtSecret,
      { expiresIn: "24h" }
    );

    // Verificar si tiene 2FA habilitado (solo si hay BD)
    if (dbConnected) {
      try {
        const tfaResult = await pool.query("SELECT * FROM dos_factores WHERE usuario_id = $1 AND habilitado = true", [user.id]);

        if (tfaResult.rows.length > 0) {
          // 2FA habilitado → generar código
          const tfa = tfaResult.rows[0];
          const codigo = generarCodigo2FA();

          // Guardar código en DB
          await pool.query(
            "UPDATE dos_factores SET codigo_actual = $1, intentos_fallidos = 0 WHERE usuario_id = $2",
            [codigo, user.id]
          );

          // Enviar código
          if (tfa.tipo === "email") {
            try {
              await enviarEmail(tfa.contacto, "Tu código 2FA", codigo);
            } catch (err) {
              console.log("[WARN] Error enviando email 2FA:", err.message);
              // No bloquear acceso, solo mostrar advertencia
            }
          } else if (tfa.tipo === "sms") {
            await enviarSMS(tfa.contacto, codigo);
          }

          return res.json({
            status: "2fa_required",
            message: "Código enviado a tu " + tfa.tipo + (tfa.tipo === "email" ? " (advertencia: error enviando email, revisa configuración)" : ""),
            session_token: token,
            method: tfa.tipo,
          });
        }
      } catch (err) {
        console.log("Error checking 2FA:", err.message);
      }
    }

    // Sin 2FA → login directo
    res.json({
      status: "success",
      token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        pais: user.pais || "AR",
        paises: user.paises || user.pais || "AR",
        profile_photo_dataurl: getProfilePhotoDataUrlFromUserRow(user),
      },
      message: "✅ Login exitoso",
    });

  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== AUTH: LOGIN PASO 2 (validar 2FA) =====
app.post("/api/auth/verify-2fa", async (req, res) => {
  try {
    const { session_token, codigo } = req.body;
    if (!session_token || !codigo) {
      return res.status(400).json({ status: "error", message: "Session token y código requeridos" });
    }

    if (!dbConnected) {
      return res.status(503).json({ status: "error", message: "DB no disponible" });
    }

    // Validar user ID desde session token (JWT) emitido en /api/auth/login
    let decoded;
    try {
      decoded = jwt.verify(String(session_token), jwtSecret);
    } catch {
      return res.status(401).json({ status: "error", message: "Sesión inválida" });
    }

    const userId = decoded?.usuario_id || decoded?.id;
    if (!userId) {
      return res.status(401).json({ status: "error", message: "Sesión inválida" });
    }

    const userResult = await pool.query("SELECT * FROM usuarios WHERE id = $1", [userId]);
    if (userResult.rows.length === 0) {
      return res.status(401).json({ status: "error", message: "Sesión inválida" });
    }

    const user = userResult.rows[0];

    // Obtener 2FA
    const tfaResult = await pool.query("SELECT * FROM dos_factores WHERE usuario_id = $1 AND habilitado = true", [
      user.id,
    ]);

    if (tfaResult.rows.length === 0) {
      return res.status(401).json({ status: "error", message: "2FA no configurado" });
    }

    const tfa = tfaResult.rows[0];

    // Validar intentos fallidos
    if (tfa.intentos_fallidos >= 5) {
      if (tfa.bloqueado_hasta && tfa.bloqueado_hasta > new Date()) {
        return res.status(429).json({ status: "error", message: "Cuenta bloqueada. Intenta en 15 minutos" });
      }
    }

    // Validar código o backup code
    let codigoValido = false;

    if (String(tfa.codigo_actual) === String(codigo)) {
      codigoValido = true;
    } else {
      // Intentar con backup codes
      const backupResult = await pool.query(
        "SELECT * FROM backup_codes WHERE usuario_id = $1 AND codigo = $2 AND usado = false LIMIT 1",
        [user.id, codigo]
      );
      if (backupResult.rows.length > 0) {
        codigoValido = true;
        // Marcar backup code como usado
        await pool.query("UPDATE backup_codes SET usado = true, fecha_uso = NOW() WHERE id = $1", [
          backupResult.rows[0].id,
        ]);
      }
    }

    if (!codigoValido) {
      // Incrementar intentos fallidos
      const nuevoIntento = tfa.intentos_fallidos + 1;
      const bloqueado = nuevoIntento >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await pool.query("UPDATE dos_factores SET intentos_fallidos = $1, bloqueado_hasta = $2 WHERE usuario_id = $3", [
        nuevoIntento,
        bloqueado,
        user.id,
      ]);

      return res.status(401).json({
        status: "error",
        message: `Código incorrecto. Intentos restantes: ${5 - nuevoIntento}`,
      });
    }

    // ✅ 2FA validado
    await pool.query("UPDATE dos_factores SET intentos_fallidos = 0, ultima_verificacion = NOW() WHERE usuario_id = $1", [
      user.id,
    ]);

    res.json({
      status: "success",
      token: session_token,
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        pais: user.pais || "AR",
        paises: user.paises || user.pais || "AR",
        profile_photo_dataurl: getProfilePhotoDataUrlFromUserRow(user),
      },
      message: "Login exitoso",
    });

    await logAudit(user.id, "LOGIN_2FA_EXITOSO", "usuarios", {});
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== 2FA: CONFIGURAR =====
app.post("/api/2fa/setup", checkMembership, async (req, res) => {
  try {
    const { tipo, contacto } = req.body;
    if (!tipo || !contacto) {
      return res.status(400).json({ status: "error", message: "Tipo y contacto requeridos" });
    }

    if (!["email", "sms"].includes(tipo)) {
      return res.status(400).json({ status: "error", message: "Tipo debe ser 'email' o 'sms'" });
    }

    const usuario_id = req.body.aseguradora_id;
    const codigo = generarCodigo2FA();

    if (tipo === "email") {
      await enviarEmail(contacto, "Código de verificación SegurosPro", codigo);
    } else {
      await enviarSMS(contacto, codigo);
    }

    await pool.query(
      `INSERT INTO dos_factores (usuario_id, tipo, contacto, codigo_actual) 
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id) DO UPDATE SET tipo = $2, contacto = $3, codigo_actual = $4`,
      [usuario_id, tipo, contacto, codigo]
    );

    res.json({ status: "success", message: "Código enviado. Verifica para habilitar 2FA" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== 2FA: VERIFICAR Y HABILITAR =====
app.post("/api/2fa/verify-setup", checkMembership, async (req, res) => {
  try {
    const { codigo } = req.body;
    if (!codigo) {
      return res.status(400).json({ status: "error", message: "Código requerido" });
    }

    const usuario_id = req.body.aseguradora_id;
    const tfaResult = await pool.query("SELECT * FROM dos_factores WHERE usuario_id = $1", [usuario_id]);

    if (tfaResult.rows.length === 0) {
      return res.status(400).json({ status: "error", message: "2FA no iniciado" });
    }

    const tfa = tfaResult.rows[0];

    if (String(tfa.codigo_actual) !== String(codigo)) {
      return res.status(400).json({ status: "error", message: "Código incorrecto" });
    }

    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const backupCode = crypto.randomBytes(6).toString("hex").toUpperCase();
      backupCodes.push(backupCode);
      await pool.query("INSERT INTO backup_codes (usuario_id, codigo) VALUES ($1, $2)", [usuario_id, backupCode]);
    }

    await pool.query("UPDATE dos_factores SET habilitado = true, codigo_actual = NULL WHERE usuario_id = $1", [
      usuario_id,
    ]);

    res.json({
      status: "success",
      message: "2FA habilitado correctamente",
      backup_codes: backupCodes,
    });

    await logAudit(usuario_id, "2FA_HABILITADO", "dos_factores", { tipo: tfa.tipo });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== 2FA: DESHABILITAR =====
app.post("/api/2fa/disable", checkMembership, async (req, res) => {
  try {
    const usuario_id = req.body.aseguradora_id;

    await pool.query("UPDATE dos_factores SET habilitado = false WHERE usuario_id = $1", [usuario_id]);

    res.json({ status: "success", message: "2FA deshabilitado" });

    await logAudit(usuario_id, "2FA_DESHABILITADO", "dos_factores", {});
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== USUARIOS: CAMBIAR PAÍS DE VISTA =====
app.post("/api/usuarios/set-pais", async (req, res) => {
  try {
    const { aseguradora_id, pais } = req.body || {};
    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const nextPais = ["AR", "UY"].includes(String(pais || "").toUpperCase())
      ? String(pais).toUpperCase()
      : null;
    if (!nextPais) {
      return res.status(400).json({ status: "error", message: "País inválido" });
    }

    const u = await pool.query(
      "SELECT id, pais, paises, nombre, email, rol, profile_photo, profile_photo_mime FROM usuarios WHERE id = $1",
      [aseguradora_id]
    );
    if (u.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Usuario no encontrado" });
    }

    const user = u.rows[0];
    const allowedRaw = String(user.paises || user.pais || "AR");
    const allowed = allowedRaw
      .split(/[,;\s]+/)
      .map((x) => x.trim().toUpperCase())
      .filter(Boolean);

    if (!allowed.includes(nextPais)) {
      return res.status(403).json({
        status: "error",
        message: "Este usuario no tiene habilitado ese país",
      });
    }

    await pool.query("UPDATE usuarios SET pais = $1 WHERE id = $2", [nextPais, aseguradora_id]);

    res.json({
      status: "success",
      user: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        pais: nextPais,
        paises: user.paises || user.pais || "AR",
        profile_photo_dataurl: getProfilePhotoDataUrlFromUserRow(user),
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/auth/register", async (req, res) => {
  try {
    const { codigo_invitacion, password, nombre, pais } = req.body;

    if (!codigo_invitacion || !password) {
      return res.status(400).json({
        status: "error",
        message: "Código de invitación y password requeridos",
      });
    }

    // Validar código de invitación
    const invResult = await pool.query(
      `SELECT * FROM invitaciones 
       WHERE codigo = $1 AND usado = false AND expira_en > NOW()`,
      [codigo_invitacion]
    );

    if (invResult.rows.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Código de invitación inválido o expirado",
      });
    }

    const invitacion = invResult.rows[0];
    const email = invitacion.email_asignado;

    if (!email) {
      return res.status(400).json({
        status: "error",
        message: "Email no asignado en la invitación",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const paisFromBody = String(pais || "").trim();
    const paisFromInvite = String(invitacion?.pais || "").trim();
    const paisNorm = normalizePais(paisFromBody || paisFromInvite || "AR");
    const paisesNorm = normalizePaisList(invitacion?.paises, paisNorm);

    // Crear usuario dentro de transacción
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      const userResult = await client.query(
        "INSERT INTO usuarios (nombre, email, password, rol, pais, paises) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, nombre, email, pais, paises",
        [nombre || "Aseguradora", email, hashedPassword, "aseguradora", paisNorm, paisesNorm]
      );

      const userId = userResult.rows[0].id;

      // Marcar invitación como usada
      await client.query(
        "UPDATE invitaciones SET usado = true, fecha_uso = NOW(), aseguradora_id = $1 WHERE id = $2",
        [userId, invitacion.id]
      );

      // Crear suscripción según plan de invitación
      const fechaInicio = new Date();
      const fechaFin = new Date();
      fechaFin.setMonth(fechaFin.getMonth() + 1); // 1 mes gratis o según plan

      await client.query(
        `INSERT INTO suscripciones (aseguradora_id, plan_id, estado, fecha_inicio, fecha_fin, fecha_proximo_pago)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [userId, invitacion.plan_id, "ACTIVA", fechaInicio, fechaFin, fechaFin]
      );

      await client.query("COMMIT");

      res.json({
        status: "success",
        user: userResult.rows[0],
        message: "Registro exitoso. Bienvenido!",
      });

      // Log auditoría
      await logAudit(userId, "REGISTRO_EXITOSO", "usuarios", { codigo_invitacion });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    if (err.code === "23505") {
      return res.status(400).json({ status: "error", message: "Email ya registrado" });
    }
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== CLIENTES (CRUD) =====
const shapeClienteForFront = (row) => {
  if (!row) return row;
  return {
    id: row.id,
    // En tenant DB no existe usuario_id; mantenemos el shape compatible
    aseguradora_id: row.aseguradora_id ?? row.usuario_id ?? null,
    usuario_id: row.usuario_id ?? row.aseguradora_id ?? null,
    nombre: row.nombre ?? "",
    apellido: row.apellido ?? "",
    mail: row.mail ?? row.email ?? "",
    email: row.email ?? row.mail ?? "",
    telefono: row.telefono ?? "",
    documento: row.documento ?? row.cedula ?? "",
    cedula: row.cedula ?? row.documento ?? "",
    pais: row.pais ?? null,
    fecha_alta: row.fecha_alta ?? row.created_at ?? null,
    created_at: row.created_at ?? row.fecha_alta ?? null,
    // Campos que el front puede esperar aunque la tabla vieja no los tenga
    polizas: row.polizas ?? "",
    grua_telefono: row.grua_telefono ?? "",
    grua_nombre: row.grua_nombre ?? "",
    descripcion_seguro: row.descripcion_seguro ?? "",
    fecha_inicio_str: row.fecha_inicio_str ?? "",
    fecha_fin_str: row.fecha_fin_str ?? "",
    fechas_de_cuota: row.fechas_de_cuota ?? "",
    cuota_paga: row.cuota_paga ?? "NO",
    monto: row.monto ?? null,
  };
};

app.post("/api/clientes/add", async (req, res) => {
  try {
    const {
      aseguradora_id,
      nombre,
      apellido,
      mail,
      telefono,
      documento,
      polizas,
      grua_telefono,
      grua_nombre,
      descripcion_seguro,
      fecha_inicio_str,
      fecha_fin_str,
      fechas_de_cuota,
      cuota_paga,
      monto,
    } = req.body;

    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }
    if (!nombre) {
      return res.status(400).json({ status: "error", message: "nombre requerido" });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const pais = await getPaisForAseguradoraId(aseguradora_id);

    const sql = `INSERT INTO clientes (
        pais, nombre, apellido, mail, telefono, documento,
        polizas, grua_telefono, grua_nombre, descripcion_seguro,
        fecha_inicio_str, fecha_fin_str, fechas_de_cuota, cuota_paga, monto
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
      RETURNING *`;
    const params = [
      pais,
      nombre,
      apellido || "",
      mail || "",
      telefono || "",
      documento || "",
      polizas || "",
      grua_telefono || "",
      grua_nombre || "",
      descripcion_seguro || "",
      fecha_inicio_str || "",
      fecha_fin_str || "",
      fechas_de_cuota || "",
      cuota_paga || "NO",
      monto || null,
    ];
    let result;
    try {
      result = await tenantPool.query(sql, params);
    } catch (err) {
      if (String(err?.code) === "42703" || /column\s+\"pais\"\s+does not exist/i.test(String(err?.message || ""))) {
        await ensureTenantClientesPaisSchema(tenantPool);
        result = await tenantPool.query(sql, params);
      } else {
        throw err;
      }
    }

    res.json({ status: "success", message: "CLIENTE CREADO", data: shapeClienteForFront(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/clientes/get", async (req, res) => {
  try {
    const { aseguradora_id } = req.body;
    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const allowedPaises = await getAllowedPaisesForAseguradoraId(aseguradora_id);
    let result;
    try {
      result = await tenantPool.query(
        "SELECT * FROM clientes WHERE pais = ANY($1::text[]) ORDER BY fecha_alta DESC, id DESC",
        [allowedPaises]
      );
    } catch (err) {
      // Tenant DB vieja sin columna pais: migrar y reintentar.
      if (String(err?.code) === "42703" || /column\s+\"pais\"\s+does not exist/i.test(String(err?.message || ""))) {
        await ensureTenantClientesPaisSchema(tenantPool);
        result = await tenantPool.query(
          "SELECT * FROM clientes WHERE pais = ANY($1::text[]) ORDER BY fecha_alta DESC, id DESC",
          [allowedPaises]
        );
      } else {
        throw err;
      }
    }
    res.json({ status: "success", data: result.rows.map(shapeClienteForFront) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/clientes/update", async (req, res) => {
  try {
    const { id, aseguradora_id, ...updates } = req.body;
    if (!id) {
      return res.status(400).json({ status: "error", message: "ID requerido" });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const allowedPaises = await getAllowedPaisesForAseguradoraId(aseguradora_id);

    // Solo permitir columnas del tenant schema
    const allowed = {
      nombre: "nombre",
      apellido: "apellido",
      mail: "mail",
      telefono: "telefono",
      documento: "documento",
      polizas: "polizas",
      grua_telefono: "grua_telefono",
      grua_nombre: "grua_nombre",
      descripcion_seguro: "descripcion_seguro",
      fecha_inicio_str: "fecha_inicio_str",
      fecha_fin_str: "fecha_fin_str",
      fechas_de_cuota: "fechas_de_cuota",
      cuota_paga: "cuota_paga",
      monto: "monto",
    };

    const setParts = [];
    const values = [];
    let idx = 1;

    for (const [key, value] of Object.entries(updates)) {
      const col = allowed[key];
      if (!col) continue;
      setParts.push(`${col} = $${idx}`);
      values.push(value);
      idx += 1;
    }

    if (setParts.length === 0) {
      return res.status(400).json({ status: "error", message: "No hay campos válidos para actualizar" });
    }

    values.push(Number(id));
    values.push(allowedPaises);
    const sql = `UPDATE clientes SET ${setParts.join(", ")}, updated_at = NOW()
       WHERE id = $${values.length - 1} AND pais = ANY($${values.length}::text[])
       RETURNING *`;
    let result;
    try {
      result = await tenantPool.query(sql, values);
    } catch (err) {
      if (String(err?.code) === "42703" || /column\s+\"pais\"\s+does not exist/i.test(String(err?.message || ""))) {
        await ensureTenantClientesPaisSchema(tenantPool);
        result = await tenantPool.query(sql, values);
      } else {
        throw err;
      }
    }

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Cliente no encontrado" });
    }

    res.json({ status: "success", message: "ACTUALIZADO", data: shapeClienteForFront(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/clientes/delete", async (req, res) => {
  try {
    const { id, aseguradora_id } = req.body;
    if (!id) {
      return res.status(400).json({ status: "error", message: "ID requerido" });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const allowedPaises = await getAllowedPaisesForAseguradoraId(aseguradora_id);
    let result;
    try {
      result = await tenantPool.query("DELETE FROM clientes WHERE id = $1 AND pais = ANY($2::text[])", [
        Number(id),
        allowedPaises,
      ]);
    } catch (err) {
      if (String(err?.code) === "42703" || /column\s+\"pais\"\s+does not exist/i.test(String(err?.message || ""))) {
        await ensureTenantClientesPaisSchema(tenantPool);
        result = await tenantPool.query("DELETE FROM clientes WHERE id = $1 AND pais = ANY($2::text[])", [
          Number(id),
          allowedPaises,
        ]);
      } else {
        throw err;
      }
    }

    if (result.rowCount === 0) {
      return res.status(404).json({ status: "error", message: "Cliente no encontrado" });
    }

    res.json({ status: "success", message: "ELIMINADO" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== CLIENT PORTAL: DNI =====
// 1) Lookup aseguradora(s) por DNI (y opcional email) SIN pedir ID numérico.
app.post("/api/cliente/lookup", async (req, res) => {
  try {
    const { dni, email } = req.body || {};
    if (!dni) return res.status(400).json({ status: "error", message: "DNI requerido" });

    const normalizedDni = normalizeDigits(dni);
    const emailNorm = String(email || "").trim().toLowerCase();

    // Buscamos en TODOS los tenants existentes (pocos en dev). No creamos DBs nuevas.
    const { rows: aseguradoras } = await pool.query("SELECT id, nombre, pais FROM usuarios ORDER BY id ASC");
    const matches = [];

    for (const a of aseguradoras) {
      const tenant = await getExistingTenantPoolForUserId(a.id);
      if (!tenant?.tenantPool) continue;

      const r = await tenant.tenantPool.query(
        "SELECT mail FROM clientes WHERE REPLACE(documento, '-', '') = $1 LIMIT 1",
        [normalizedDni]
      );

      if (r.rows.length === 0) continue;
      const mail = String(r.rows[0]?.mail || "").trim().toLowerCase();

      if (emailNorm && mail && mail !== emailNorm) continue;

      matches.push({
        aseguradora_id: a.id,
        aseguradora_nombre: a.nombre || `Aseguradora ${a.id}`,
        pais: a.pais || "AR",
      });
    }

    if (matches.length === 0) {
      return res.status(404).json({ status: "error", message: "No encontramos ese DNI en ninguna aseguradora" });
    }

    // Si hay múltiples coincidencias y no vino email, pedimos email para evitar confusiones y reducir enumeración.
    if (matches.length > 1 && !emailNorm) {
      return res.status(200).json({
        status: "success",
        message: "Se encontraron varias coincidencias. Ingresá tu email para identificar la aseguradora correcta.",
        matches,
        needs_email: true,
      });
    }

    res.json({ status: "success", matches, needs_email: false });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// 2) Enviar código al email del cliente (requiere aseguradora seleccionada)
app.post("/api/cliente/send-code", async (req, res) => {
  try {
    const { dni, aseguradora_id } = req.body || {};
    if (!dni) return res.status(400).json({ status: "error", message: "DNI requerido" });
    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const normalizedDni = normalizeDigits(dni);
    const key = `${Number(aseguradora_id)}:${normalizedDni}`;

    const last = clientLoginCooldown.get(key) || 0;
    if (Date.now() - last < 60_000) {
      return res.status(429).json({
        status: "error",
        message: "Esperá 1 minuto antes de pedir otro código.",
      });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const r = await tenantPool.query(
      "SELECT mail FROM clientes WHERE REPLACE(documento, '-', '') = $1 LIMIT 1",
      [normalizedDni]
    );
    if (r.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró cliente con ese DNI" });
    }

    const email = String(r.rows[0]?.mail || "").trim();
    if (!email || !email.includes("@")) {
      return res.status(400).json({
        status: "error",
        message: "Este cliente no tiene un email válido cargado. Pedile a tu aseguradora que lo actualice.",
      });
    }

    const purpose = `client:${Number(aseguradora_id)}:${normalizedDni}`;

    let emailWarning = "";
    if (dbConnected) {
      await createEmailCodeAndSend({ email, purpose });
    } else {
      const sent = await sendVerificationCode(email);
      if (!sent?.success) {
        const errorMsg = sent?.message || "EMAIL_SEND_FAIL: unknown";
        console.log("[ERROR REAL EMAIL]", errorMsg, sent?.error || null);
        return res.status(500).json({ status: "error", message: errorMsg, error: sent?.error || null });
      }
    }
    clientLoginCooldown.set(key, Date.now());
    clientLoginPending.set(key, { email, createdAt: Date.now(), purpose });
    res.json({
      status: "success",
      message: "Código enviado",
      masked_email: maskEmail(email),
      email_warning: emailWarning,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// 3) Verificar código y emitir client_token
app.post("/api/cliente/verify-code", async (req, res) => {
  try {
    const { dni, aseguradora_id, code } = req.body || {};
    if (!dni) return res.status(400).json({ status: "error", message: "DNI requerido" });
    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }
    if (!code) return res.status(400).json({ status: "error", message: "Código requerido" });

    const normalizedDni = normalizeDigits(dni);
    const key = `${Number(aseguradora_id)}:${normalizedDni}`;

    const purpose = `client:${Number(aseguradora_id)}:${normalizedDni}`;

    let v;
    if (dbConnected) {
      v = await verifyEmailCodeByPurpose({ purpose, code: String(code).trim() });
    } else {
      const pending = clientLoginPending.get(key);
      if (!pending?.email) {
        return res.status(400).json({ status: "error", message: "Primero pedí el código" });
      }
      v = verifyCode(pending.email, String(code).trim());
    }

    if (!v?.valid) {
      const reason = String(v?.reason || "").trim();
      const msg = String(v?.message || "Código inválido");
      return res.status(401).json({
        status: "error",
        message: reason ? `${msg} (ref: ${reason})` : msg,
        reason: reason || undefined,
      });
    }

    clientLoginPending.delete(key);

    const token = jwt.sign(
      { type: "client", aseguradora_id: Number(aseguradora_id), dni: normalizedDni },
      jwtSecret,
      { expiresIn: "12h" }
    );

    res.json({ status: "success", token });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/cliente/by-dni", async (req, res) => {
  try {
    const { dni, aseguradora_id, client_token } = req.body;
    if (!dni) {
      return res.status(400).json({ status: "error", message: "DNI requerido" });
    }
    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    // Seguridad: no permitir acceso solo con DNI. Requiere token del flujo por código.
    if (!client_token) {
      return res.status(401).json({
        status: "error",
        message: "Acceso no autorizado. Ingresá con código de verificación.",
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(String(client_token), jwtSecret);
    } catch {
      return res.status(401).json({ status: "error", message: "Token inválido o expirado" });
    }

    const normalized = normalizeDigits(dni);
    if (decoded?.type !== "client") {
      return res.status(401).json({ status: "error", message: "Token inválido" });
    }
    if (Number(decoded.aseguradora_id) !== Number(aseguradora_id)) {
      return res.status(401).json({ status: "error", message: "Token no corresponde a esta aseguradora" });
    }
    if (String(decoded.dni) !== String(normalized)) {
      return res.status(401).json({ status: "error", message: "Token no corresponde a este DNI" });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const result = await tenantPool.query(
      "SELECT * FROM clientes WHERE REPLACE(documento, '-', '') = $1 LIMIT 1",
      [normalized]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "No se encontró cliente con ese DNI" });
    }

    res.json({ status: "success", data: shapeClienteForFront(result.rows[0]) });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== PERFIL ASEGURADORA =====
app.post("/api/perfil/get", async (req, res) => {
  try {
    const { aseguradora_id } = req.body;
    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const tenantPool = await getTenantPoolFromReq(req);
    const result = await tenantPool.query("SELECT * FROM perfil_aseguradora ORDER BY id DESC LIMIT 1");

    const perfil = result.rows[0] || {
      nombre_comercial: "",
      telefono: "",
      email: "",
      direccion: "",
      horarios: "",
      logo_dataurl: "",
    };

    res.json({ status: "success", data: perfil });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/perfil/save", async (req, res) => {
  try {
    const { aseguradora_id, nombre_comercial, telefono, email, direccion, horarios, logo_dataurl } = req.body;

    if (!aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const tenantPool = await getTenantPoolFromReq(req);

    const result = await tenantPool.query(
      `INSERT INTO perfil_aseguradora (nombre_comercial, telefono, email, direccion, horarios, logo_dataurl)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [nombre_comercial || "", telefono || "", email || "", direccion || "", horarios || "", logo_dataurl || ""]
    );

    res.json({ status: "success", message: "Perfil guardado", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== CONFIG WHATSAPP =====
app.post("/api/config/save", async (req, res) => {
  try {
    const { scope = "GLOBAL", scope_id = "", wpp_phone_number_id, wpp_access_token, openai_api_key } = req.body;

    const tenantPool = await getTenantPoolFromReq(req);

    if (wpp_phone_number_id) {
      await tenantPool.query(
        `INSERT INTO configuracion (key, value, scope, scope_id) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (key, scope, scope_id) DO UPDATE SET value = $2, updated_at = NOW()`,
        ["wpp_phone_number_id", wpp_phone_number_id, scope, scope_id || null]
      );

      // IMPORTANT: Meta webhooks no envían aseguradora_id. Para enrutar, guardamos
      // el phone_number_id también en master `usuarios` (1 por aseguradora).
      if (dbConnected && scope === "ASEGURADORA" && scope_id) {
        await pool.query(
          "UPDATE usuarios SET wpp_phone_number_id = $1 WHERE id = $2",
          [String(wpp_phone_number_id).trim(), scope_id]
        );
      }
    }

    if (wpp_access_token) {
      await tenantPool.query(
        `INSERT INTO configuracion (key, value, scope, scope_id) 
         VALUES ($1, $2, $3, $4) 
         ON CONFLICT (key, scope, scope_id) DO UPDATE SET value = $2, updated_at = NOW()`,
        ["wpp_access_token", wpp_access_token, scope, scope_id || null]
      );
    }

    if (openai_api_key) {
      const k = String(openai_api_key || "").trim();
      // Evitar guardar placeholders
      const looksPlaceholder = /tu[_-]?openai/i.test(k) || /_aqui$/i.test(k) || /^YOUR_/i.test(k);
      if (!looksPlaceholder) {
        await tenantPool.query(
          `INSERT INTO configuracion (key, value, scope, scope_id) 
           VALUES ($1, $2, $3, $4) 
           ON CONFLICT (key, scope, scope_id) DO UPDATE SET value = $2, updated_at = NOW()`,
          ["openai_api_key", k, scope, scope_id || null]
        );
      }
    }

    res.json({ status: "success", message: "Configuración guardada" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/config/get", async (req, res) => {
  try {
    const { scope = "GLOBAL", scope_id = "" } = req.body;

    const tenantPool = await getTenantPoolFromReq(req);

    // Preferimos config del scope solicitado, pero mantenemos compatibilidad
    // con valores antiguos guardados en GLOBAL.
    const readCfg = async (key) => {
      const r = await tenantPool.query(
        `SELECT value
         FROM configuracion
         WHERE key = $1
           AND (
             (scope = $2 AND (scope_id = $3 OR scope_id IS NULL))
             OR (scope = 'GLOBAL' AND scope_id IS NULL)
           )
         ORDER BY (scope = $2) DESC, scope_id DESC NULLS LAST
         LIMIT 1`,
        [key, scope, scope_id || null]
      );
      return String(r.rows[0]?.value || "");
    };

    const phoneRaw = (await readCfg("wpp_phone_number_id")).trim();
    const tokenRaw = (await readCfg("wpp_access_token")).trim();
    const openaiRaw = (await readCfg("openai_api_key")).trim();

    res.json({
      status: "success",
      data: {
        wpp_phone_number_id_masked: maskMiddle(phoneRaw),
        wpp_access_token_masked: maskMiddle(tokenRaw),
        wpp_has_phone_number_id: !!phoneRaw,
        wpp_has_access_token: !!tokenRaw,
        openai_api_key_masked: maskMiddle(openaiRaw),
        openai_has_api_key: !!openaiRaw,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

const resolveOpenAiApiKeyForReq = async (req) => {
  // 1) Preferir key guardada por aseguradora (tenant)
  try {
    const tenantPool = await getTenantPoolFromReq(req);
    const preferredScope = req.body?.scope || "ASEGURADORA";
    const scopeId = req.body?.scope_id || req.body?.aseguradora_id || null;

    const tryRead = async (scope) => {
      const r = await tenantPool.query(
        "SELECT value FROM configuracion WHERE key = $1 AND scope = $2 AND (scope_id = $3 OR scope_id IS NULL) ORDER BY scope_id DESC NULLS LAST LIMIT 1",
        ["openai_api_key", scope, scopeId]
      );
      return String(r.rows[0]?.value || "").trim();
    };

    // 1a) Scope solicitado (o ASEGURADORA por defecto)
    const v1 = await tryRead(preferredScope);
    if (v1) return v1;

    // 1b) Fallback a ASEGURADORA si pidieron otro scope
    if (preferredScope !== "ASEGURADORA") {
      const v2 = await tryRead("ASEGURADORA");
      if (v2) return v2;
    }

    // 1c) Fallback a GLOBAL (compatibilidad)
    const rGlobal = await tenantPool.query(
      "SELECT value FROM configuracion WHERE key = $1 AND scope = 'GLOBAL' AND scope_id IS NULL LIMIT 1",
      ["openai_api_key"]
    );
    const vg = String(rGlobal.rows[0]?.value || "").trim();
    if (vg) return vg;
  } catch {
    // ignore
  }

  // 2) Fallback a env
  return String(process.env.OPENAI_API_KEY || "").trim();
};

// ===== WHATSAPP INBOX: SSE (realtime) =====
const wppSseClientsByAsegId = new Map(); // aseguradora_id -> Set(res)

const wppBroadcast = (aseguradoraId, payload) => {
  try {
    const key = String(Number(aseguradoraId));
    const set = wppSseClientsByAsegId.get(key);
    if (!set || set.size === 0) return;
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(data);
      } catch {
        // ignore
      }
    }
  } catch {
    // ignore
  }
};

const resolveWhatsAppCredentialsForReq = async (req) => {
  // Prefer tenant config (ASEGURADORA), fallback GLOBAL, then env.
  try {
    const tenantPool = await getTenantPoolFromReq(req);
    const scope = req.body?.scope || "ASEGURADORA";
    const scopeId = req.body?.scope_id || req.body?.aseguradora_id || null;

    const readCfg = async (key) => {
      const r = await tenantPool.query(
        `SELECT value
         FROM configuracion
         WHERE key = $1
           AND (
             (scope = $2 AND (scope_id = $3 OR scope_id IS NULL))
             OR (scope = 'GLOBAL' AND scope_id IS NULL)
           )
         ORDER BY (scope = $2) DESC, scope_id DESC NULLS LAST
         LIMIT 1`,
        [key, scope, scopeId ? String(scopeId) : null]
      );
      return String(r.rows[0]?.value || "").trim();
    };

    const phoneId = (await readCfg("wpp_phone_number_id")) || "";
    const token = (await readCfg("wpp_access_token")) || "";
    return {
      phoneId: phoneId.trim(),
      token: token.trim(),
    };
  } catch {
    // ignore
  }

  return {
    phoneId: String(process.env.WHATSAPP_PHONE_NUMBER_ID || "").trim(),
    token: String(process.env.WHATSAPP_ACCESS_TOKEN || "").trim(),
  };
};

const upsertWppConversationAndInsertMessage = async (
  tenantPool,
  { waContact, phone, name, direction, waMessageId, fromPhone, toPhone, body, waTimestamp }
) => {
  const safeWa = String(waContact || "").trim();
  if (!safeWa) return null;

  const safePhone = String(phone || safeWa).trim();
  const safeName = String(name || "").trim();
  const safeBody = String(body || "").trim();

  const c = await tenantPool.query(
    `INSERT INTO whatsapp_conversations (wa_contact, phone, name, last_message_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (wa_contact) DO UPDATE SET
       phone = EXCLUDED.phone,
       name = CASE WHEN EXCLUDED.name <> '' THEN EXCLUDED.name ELSE whatsapp_conversations.name END,
       last_message_at = NOW(),
       updated_at = NOW()
     RETURNING *`,
    [safeWa, safePhone, safeName]
  );
  const conversation = c.rows[0];
  if (!conversation?.id) return null;

  // Insert message (dedupe by wa_message_id if present)
  const m = await tenantPool.query(
    `INSERT INTO whatsapp_messages (conversation_id, direction, wa_message_id, from_phone, to_phone, body, wa_timestamp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (wa_message_id) DO NOTHING
     RETURNING *`,
    [
      Number(conversation.id),
      direction,
      waMessageId ? String(waMessageId) : null,
      String(fromPhone || "").trim(),
      String(toPhone || "").trim(),
      safeBody,
      waTimestamp ? Number(waTimestamp) : null,
    ]
  );

  return { conversation, message: m.rows[0] || null };
};

// ===== WHATSAPP INBOX: WEBHOOK =====
app.get("/api/whatsapp/webhook", async (req, res) => {
  try {
    // Meta verification
    const mode = String(req.query["hub.mode"] || "");
    const token = String(req.query["hub.verify_token"] || "");
    const challenge = String(req.query["hub.challenge"] || "");

    const expected = String(process.env.WHATSAPP_VERIFY_TOKEN || "").trim();
    if (mode === "subscribe" && expected && token === expected) {
      return res.status(200).send(challenge);
    }

    // En producción, si no hay verify token configurado, devolvemos un error claro.
    if (mode === "subscribe" && !expected && isProd()) {
      return res.status(503).send("WHATSAPP_VERIFY_TOKEN no configurado en el servidor");
    }

    // Local/dev: allow challenge if no token configured.
    if (mode === "subscribe" && !expected) {
      return res.status(200).send(challenge || "ok");
    }

    return res.sendStatus(403);
  } catch {
    return res.sendStatus(403);
  }
});

const verifyMetaWebhookSignature = (req) => {
  const secret = String(process.env.META_APP_SECRET || "").trim();
  if (!secret) return { ok: true, skipped: true };

  const header = String(req.headers["x-hub-signature-256"] || "").trim();
  if (!header || !header.startsWith("sha256=")) {
    return { ok: false, reason: "missing_signature" };
  }

  const gotHex = header.slice("sha256=".length);
  const raw = req.rawBody;
  if (!raw || !Buffer.isBuffer(raw)) {
    return { ok: false, reason: "missing_raw_body" };
  }

  let gotBuf;
  try {
    gotBuf = Buffer.from(gotHex, "hex");
  } catch {
    return { ok: false, reason: "bad_signature" };
  }

  const expectedHex = crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const expectedBuf = Buffer.from(expectedHex, "hex");

  if (gotBuf.length !== expectedBuf.length) {
    return { ok: false, reason: "signature_mismatch" };
  }

  const ok = crypto.timingSafeEqual(gotBuf, expectedBuf);
  return ok ? { ok: true } : { ok: false, reason: "signature_mismatch" };
};

app.post("/api/whatsapp/webhook", async (req, res) => {
  // IMPORTANT: Meta webhooks no incluyen aseguradora_id.
  // Para enrutar al tenant correcto, resolvemos por metadata.phone_number_id.
  try {
    const sig = verifyMetaWebhookSignature(req);
    if (!sig.ok) {
      pushWppDebug("webhookHits", {
        at: new Date().toISOString(),
        ok: false,
        resolved: false,
        message: `Firma inválida (${sig.reason})`,
      });
      return res.status(403).json({ status: "error", message: "Firma inválida" });
    }

    const payload = req.body || {};

    const extractPhoneNumberIdFromWebhook = (p) => {
      const entries = Array.isArray(p?.entry) ? p.entry : [];
      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          const phoneId = String(value?.metadata?.phone_number_id || "").trim();
          if (phoneId) return phoneId;
        }
      }
      return "";
    };

    let aseguradoraId = Number(req.body?.aseguradora_id || req.query?.aseguradora_id);
    if (!Number.isFinite(aseguradoraId)) {
      const phoneNumberId = extractPhoneNumberIdFromWebhook(payload);
      if (phoneNumberId && dbConnected) {
        const r = await pool.query(
          "SELECT id FROM usuarios WHERE wpp_phone_number_id = $1 LIMIT 1",
          [phoneNumberId]
        );
        if (r.rows?.[0]?.id != null) {
          aseguradoraId = Number(r.rows[0].id);
        }
      }
    }

    if (!Number.isFinite(aseguradoraId)) {
      pushWppDebug("webhookHits", {
        at: new Date().toISOString(),
        ok: false,
        resolved: false,
        phone_number_id: (() => {
          try {
            return extractPhoneNumberIdFromWebhook(payload) || null;
          } catch {
            return null;
          }
        })(),
        message: "No se pudo resolver la aseguradora (phone_number_id)",
      });
      // Siempre ACK 200 para que Meta no reintente en loop.
      // El evento queda registrado en debug para diagnosticar el enrutamiento.
      return res.status(200).json({ status: "ignored", received: true, saved: false, resolved: false });
    }

    // Inyectar aseguradora_id para reutilizar el helper de tenant.
    req.body = { ...(req.body || {}), aseguradora_id: aseguradoraId };
    const tenantPool = await getTenantPoolFromReq(req);
    const entries = Array.isArray(payload.entry) ? payload.entry : [];
    let savedAny = false;

    // debug hit
    try {
      const phoneNumberId = extractPhoneNumberIdFromWebhook(payload) || null;
      let msgCount = 0;
      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes) ? entry.changes : [];
        for (const change of changes) {
          const value = change?.value || {};
          const messages = Array.isArray(value?.messages) ? value.messages : [];
          msgCount += messages.length;
        }
      }
      pushWppDebug("webhookHits", {
        at: new Date().toISOString(),
        ok: true,
        resolved: true,
        aseguradora_id: Number(aseguradoraId),
        phone_number_id: phoneNumberId,
        messages: msgCount,
      });
    } catch {
      // ignore
    }

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const value = change?.value || {};
        const contacts = Array.isArray(value?.contacts) ? value.contacts : [];
        const messages = Array.isArray(value?.messages) ? value.messages : [];

        for (const msg of messages) {
          const waFrom = normalizeDigits(msg?.from);
          const waId = String(msg?.id || "").trim();
          const waTs = msg?.timestamp ? Number(msg.timestamp) : null;

          const contact = contacts.find((c) => normalizeDigits(c?.wa_id) === waFrom);
          const name = String(contact?.profile?.name || "").trim();

          const textBody = String(msg?.text?.body || "").trim();
          const bodyText = textBody || "(mensaje no-texto)";

          const toPhone = String(value?.metadata?.display_phone_number || "").trim();

          const saved = await upsertWppConversationAndInsertMessage(tenantPool, {
            waContact: waFrom,
            phone: waFrom,
            name,
            direction: "in",
            waMessageId: waId || null,
            fromPhone: waFrom,
            toPhone: toPhone || "",
            body: bodyText,
            waTimestamp: waTs,
          });

          if (saved?.message) {
            savedAny = true;
            wppBroadcast(aseguradoraId, {
              type: "wpp_message",
              conversation_id: saved.conversation.id,
              wa_contact: saved.conversation.wa_contact,
              direction: "in",
              body: saved.message.body,
              created_at: saved.message.created_at,
            });

            // Auto-respuesta IA: no bloquea el webhook (ejecuta async)
            setTimeout(() => {
              maybeAutoReplyFromWebhook({
                aseguradoraId,
                waFrom,
                name,
                bodyText,
                conversationId: saved.conversation.id,
              });
            }, 0);
          }
        }
      }
    }

    return res.json({ status: "success", received: true, saved: savedAny });
  } catch (err) {
    pushWppDebug("webhookHits", {
      at: new Date().toISOString(),
      ok: false,
      error: err?.message || String(err),
    });
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== DEBUG: WhatsApp status (dev) =====
app.get("/api/whatsapp/debug/status", async (req, res) => {
  try {
    if (!requireAutomationKey(req)) {
      return res.status(401).json({ status: "error", message: "No autorizado" });
    }

    const aseguradoraId = Number(req.query?.aseguradora_id);
    if (!Number.isFinite(aseguradoraId)) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    // tenant creds
    const creds = await resolveWhatsAppCredentialsForReq({ body: { aseguradora_id: aseguradoraId }, query: {}, headers: {} });
    const effectivePhoneId = safeTrim(creds.phoneId || process.env.WHATSAPP_PHONE_NUMBER_ID || "");
    const effectiveToken = safeTrim(creds.token || process.env.WHATSAPP_ACCESS_TOKEN || "");
    const openaiKey = await resolveOpenAiApiKeyForReq({ body: { aseguradora_id: aseguradoraId, scope: "ASEGURADORA", scope_id: aseguradoraId } });
    const aiEnabled = await resolveWppAiAutoreplyEnabledForAseguradora(aseguradoraId);

    // master mapping
    let mappedPhoneNumberId = null;
    if (dbConnected) {
      try {
        const r = await pool.query("SELECT wpp_phone_number_id FROM usuarios WHERE id = $1 LIMIT 1", [String(aseguradoraId)]);
        mappedPhoneNumberId = String(r.rows?.[0]?.wpp_phone_number_id || "").trim() || null;
      } catch {
        mappedPhoneNumberId = null;
      }
    }

    return res.json({
      status: "success",
      data: {
        backend_ok: true,
        dbConnected: !!dbConnected,
        wpp: {
          has_phone_number_id: !!effectivePhoneId,
          has_access_token: !!effectiveToken,
          phone_number_id_masked: maskMiddle(effectivePhoneId),
          access_token_masked: maskMiddle(effectiveToken),
          tenant_phone_number_id_masked: maskMiddle(creds.phoneId),
          tenant_access_token_masked: maskMiddle(creds.token),
          env_phone_number_id_masked: maskMiddle(process.env.WHATSAPP_PHONE_NUMBER_ID || ""),
          env_access_token_masked: maskMiddle(process.env.WHATSAPP_ACCESS_TOKEN || ""),
          master_mapped_phone_number_id_masked: maskMiddle(mappedPhoneNumberId || ""),
        },
        openai: {
          has_api_key: !!openaiKey,
          api_key_masked: maskMiddle(openaiKey),
        },
        ai: {
          autoreply_enabled: !!aiEnabled,
          env_autoreply: isTruthy(process.env.WPP_AI_AUTOREPLY),
        },
        debug: {
          webhook_hits: wppDebug.webhookHits.slice(-10),
          send_attempts: wppDebug.sendAttempts.slice(-10),
        },
      },
    });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/whatsapp/stream", async (req, res) => {
  try {
    const aseguradoraId = Number(req.query?.aseguradora_id);
    if (!Number.isFinite(aseguradoraId)) {
      return res.status(400).end();
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    res.write(`event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`);

    const key = String(aseguradoraId);
    if (!wppSseClientsByAsegId.has(key)) wppSseClientsByAsegId.set(key, new Set());
    wppSseClientsByAsegId.get(key).add(res);

    const keepAlive = setInterval(() => {
      try {
        res.write(": ping\n\n");
      } catch {
        // ignore
      }
    }, 25000);

    req.on("close", () => {
      clearInterval(keepAlive);
      try {
        const set = wppSseClientsByAsegId.get(key);
        if (set) {
          set.delete(res);
          if (set.size === 0) wppSseClientsByAsegId.delete(key);
        }
      } catch {
        // ignore
      }
    });
  } catch {
    return res.status(500).end();
  }
});

// ===== WHATSAPP INBOX: LIST CONVERSATIONS/MESSAGES =====
app.post("/api/whatsapp/conversations/list", async (req, res) => {
  try {
    const tenantPool = await getTenantPoolFromReq(req);
    const r = await tenantPool.query(
      `SELECT c.id, c.wa_contact, c.phone, c.name, c.last_message_at,
              m.body AS last_body, m.direction AS last_direction, m.created_at AS last_created_at
       FROM whatsapp_conversations c
       LEFT JOIN LATERAL (
         SELECT body, direction, created_at
         FROM whatsapp_messages
         WHERE conversation_id = c.id
         ORDER BY created_at DESC
         LIMIT 1
       ) m ON TRUE
       ORDER BY c.last_message_at DESC NULLS LAST, c.updated_at DESC
       LIMIT 200`
    );
    res.json({ status: "success", data: r.rows || [] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/whatsapp/messages/list", async (req, res) => {
  try {
    const tenantPool = await getTenantPoolFromReq(req);
    const conversationId = Number(req.body?.conversation_id);
    if (!Number.isFinite(conversationId)) {
      return res.status(400).json({ status: "error", message: "conversation_id requerido" });
    }
    const r = await tenantPool.query(
      `SELECT id, conversation_id, direction, from_phone, to_phone, body, created_at
       FROM whatsapp_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 500`,
      [conversationId]
    );
    res.json({ status: "success", data: r.rows || [] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== WHATSAPP INBOX: SIMULATE (dev/local) =====
// Permite simular mensajes entrantes desde el Portal Cliente sin depender de Meta.
app.post("/api/whatsapp/simulate-incoming", async (req, res) => {
  try {
    const aseguradoraId = Number(req.body?.aseguradora_id || req.query?.aseguradora_id);
    if (!Number.isFinite(aseguradoraId)) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const fromPhone = normalizeDigits(req.body?.from_phone || req.body?.from || "");
    const name = String(req.body?.name || "").trim();
    const body = String(req.body?.body || req.body?.message || "").trim();

    if (!fromPhone || !body) {
      return res.status(400).json({ status: "error", message: "Faltan from_phone o body" });
    }

    const tenantPool = await getTenantPoolFromReq({
      body: { aseguradora_id: aseguradoraId },
      query: { aseguradora_id: aseguradoraId },
      headers: {},
    });

    const saved = await upsertWppConversationAndInsertMessage(tenantPool, {
      waContact: fromPhone,
      phone: fromPhone,
      name,
      direction: "in",
      waMessageId: null,
      fromPhone,
      toPhone: "",
      body,
      waTimestamp: null,
    });

    if (saved?.message) {
      wppBroadcast(aseguradoraId, {
        type: "wpp_message",
        conversation_id: saved.conversation.id,
        wa_contact: saved.conversation.wa_contact,
        direction: "in",
        body: saved.message.body,
        created_at: saved.message.created_at,
      });
    }

    return res.json({ status: "success", data: { conversation_id: saved?.conversation?.id || null } });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== WEBHOOKS (n8n / automations) =====
// Si ya tenés el Trigger de WhatsApp en n8n, podés "espejar" el mensaje en Cogniseguros
// usando este endpoint. Así el menú Mensajes muestra inbound en tiempo real.
app.post("/api/webhooks/n8n/whatsapp-incoming", async (req, res) => {
  try {
    if (!requireAutomationKey(req)) {
      return res.status(401).json({ status: "error", message: "No autorizado" });
    }

    let aseguradoraId = Number(req.body?.aseguradora_id || req.query?.aseguradora_id);
    if (!Number.isFinite(aseguradoraId)) {
      const phoneNumberId = safeTrim(req.body?.phone_number_id || req.body?.metadata?.phone_number_id || "");
      const resolved = await resolveAseguradoraIdFromPhoneNumberId(phoneNumberId);
      if (Number.isFinite(resolved)) aseguradoraId = Number(resolved);
    }

    if (!Number.isFinite(aseguradoraId)) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido (o phone_number_id)" });
    }

    const fromPhone = normalizeDigits(req.body?.from_phone || req.body?.from || req.body?.wa_from || "");
    const name = safeTrim(req.body?.name || req.body?.profile_name || "");
    const body = safeTrim(req.body?.body || req.body?.message || req.body?.text || "");
    const waMessageId = safeTrim(req.body?.wa_message_id || req.body?.id || "") || null;
    const toPhone = safeTrim(req.body?.to_phone || req.body?.to || req.body?.display_phone_number || "");
    const waTimestamp = req.body?.wa_timestamp != null ? Number(req.body.wa_timestamp) : null;

    if (!fromPhone || !body) {
      return res.status(400).json({ status: "error", message: "Faltan from_phone o body" });
    }

    const tenantPool = await getTenantPoolFromReq({
      body: { aseguradora_id: aseguradoraId },
      query: { aseguradora_id: aseguradoraId },
      headers: {},
    });

    const saved = await upsertWppConversationAndInsertMessage(tenantPool, {
      waContact: fromPhone,
      phone: fromPhone,
      name,
      direction: "in",
      waMessageId,
      fromPhone,
      toPhone,
      body,
      waTimestamp,
    });

    if (saved?.message) {
      wppBroadcast(Number(aseguradoraId), {
        type: "wpp_message",
        conversation_id: saved.conversation.id,
        wa_contact: saved.conversation.wa_contact,
        direction: "in",
        body: saved.message.body,
        created_at: saved.message.created_at,
      });
    }

    return res.json({ status: "success", data: { conversation_id: saved?.conversation?.id || null } });
  } catch (err) {
    return res.status(500).json({ status: "error", message: err.message });
  }
});

// n8n puede llamar esto para responder al cliente. Envía por WhatsApp Cloud y queda guardado en Mensajes.
app.post("/api/webhooks/n8n/whatsapp-send", async (req, res) => {
  try {
    if (!requireAutomationKey(req)) {
      return res.status(401).json({ status: "error", message: "No autorizado" });
    }

    let aseguradoraId = Number(req.body?.aseguradora_id || req.query?.aseguradora_id);
    if (!Number.isFinite(aseguradoraId)) {
      const phoneNumberId = safeTrim(req.body?.phone_number_id || req.body?.metadata?.phone_number_id || "");
      const resolved = await resolveAseguradoraIdFromPhoneNumberId(phoneNumberId);
      if (Number.isFinite(resolved)) aseguradoraId = Number(resolved);
    }

    if (!Number.isFinite(aseguradoraId)) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido (o phone_number_id)" });
    }

    const to = safeTrim(req.body?.to || req.body?.telefono || "");
    const message = safeTrim(req.body?.message || req.body?.body || "");
    if (!to || !message) {
      return res.status(400).json({ status: "error", message: "Faltan to o message" });
    }

    const result = await sendWhatsAppText(req, { aseguradora_id: aseguradoraId, to, message });
    return res.json({ status: "success", ...result });
  } catch (err) {
    const code = Number(err?.statusCode) || 500;
    return res.status(code).json(toSafeApiErrorBody(err));
  }
});

// ===== WHATSAPP: SEND =====
app.post("/api/whatsapp/send", async (req, res) => {
  try {
    // Compatibilidad:
    // - Inbox/manual: { aseguradora_id, to, message }
    // - Auto: { aseguradora_id, tipo: 'vencimiento'|'pago', telefono, ... }
    const tipo = String(req.body?.tipo || "").trim();
    const to = String(req.body?.to || req.body?.telefono || "").trim();
    let message = String(req.body?.message || "").trim();

    if (!message && tipo === "vencimiento") {
      const nombre = String(req.body?.nombre || "").trim();
      const apellido = String(req.body?.apellido || "").trim();
      const dias = req.body?.dias_restantes ?? req.body?.dias_left ?? "";
      message =
        `Hola ${nombre} ${apellido} su seguro esta por vencer. ` +
        `Por favor contactanos para no quedarse si cobertura. ` +
        `Le quedan ${dias || "pocos"} dia(s) para quedar sin cobertura. Saludos`;
    }

    if (!message && tipo === "pago") {
      const nombre = String(req.body?.nombre || "").trim();
      const apellido = String(req.body?.apellido || "").trim();
      const monto = String(req.body?.monto || "").trim();
      const alias = String(req.body?.alias || "").trim();
      const montoTxt = monto ? `Monto: ${monto}. ` : "";
      const aliasTxt = alias ? `Alias: ${alias}. ` : "";
      message = `Hola ${nombre} ${apellido}, su cuota ha vencido. ${montoTxt}${aliasTxt}Por favor regularice para ponerse al día.`;
    }

    if (!to || !message) {
      return res.status(400).json({ status: "error", message: "Faltan destinatario o mensaje" });
    }

    if (!req.body?.aseguradora_id) {
      return res.status(400).json({ status: "error", message: "aseguradora_id requerido" });
    }

    const result = await sendWhatsAppText(req, {
      aseguradora_id: Number(req.body.aseguradora_id),
      to,
      message,
    });

    res.json({ status: "success", ...result });
  } catch (err) {
    const code = Number(err?.statusCode) || 500;
    return res.status(code).json(toSafeApiErrorBody(err));
  }
});

// ===== OPENAI: COPY =====
app.post("/api/marketing/copy", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ status: "error", message: "Prompt vacío" });
    }

    const apiKey = await resolveOpenAiApiKeyForReq(req);
    const looksPlaceholder =
      !apiKey ||
      /tu[_-]?openai/i.test(apiKey) ||
      /_aqui$/i.test(apiKey) ||
      /^YOUR_/i.test(apiKey);
    if (looksPlaceholder) {
      return res
        .status(503)
        .json(
          toSafeApiErrorBody(
            makeConfigError(
              "openai",
              ["OPENAI_API_KEY"],
              "OpenAI no configurado. Guardá una API key en Configuración (OpenAI) o configurá OPENAI_API_KEY en EasyPanel y reiniciá el backend."
            )
          )
        );
    }

    const system =
      "Sos un redactor profesional para seguros (autos/vida). " +
      "Español rioplatense neutro. Sin emojis. " +
      "Formato WhatsApp: frases cortas, claro, directo. " +
      "Devolvé 3 variantes numeradas 1), 2), 3) y solo el texto final.";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: system },
          { role: "user", content: String(prompt) },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ status: "error", message: err.error?.message || "OpenAI error" });
    }

    const data = await response.json();
    const copy = data?.choices?.[0]?.message?.content?.trim() || "";

    res.json({ status: "success", copy });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== OPENAI: IMAGE =====
app.post("/api/marketing/image", async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ status: "error", message: "Prompt vacío" });
    }

    const apiKey = await resolveOpenAiApiKeyForReq(req);
    const looksPlaceholder =
      !apiKey ||
      /tu[_-]?openai/i.test(apiKey) ||
      /_aqui$/i.test(apiKey) ||
      /^YOUR_/i.test(apiKey);
    if (looksPlaceholder) {
      return res
        .status(503)
        .json(
          toSafeApiErrorBody(
            makeConfigError(
              "openai",
              ["OPENAI_API_KEY"],
              "OpenAI no configurado. Guardá una API key en Configuración (OpenAI) o configurá OPENAI_API_KEY en EasyPanel y reiniciá el backend."
            )
          )
        );
    }

    const response = await fetch("https://api.openai.com/v1/images/generations", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "dall-e-3",
        prompt:
          "Generá UNA imagen publicitaria ultra realista y profesional para una aseguradora. " +
          "Estilo: fotografía real (no ilustración), iluminación natural de estudio, composición premium/corporativa, alta credibilidad. " +
          "Debe ser fiel al concepto del brief y coherente con el mensaje comercial. " +
          "Idioma: cualquier texto que aparezca DEBE estar en español, salvo que el brief pida explícitamente otro idioma. " +
          "Preferencia: sin texto dentro de la imagen (no logos/marcas ni tipografías) a menos que el brief lo solicite. " +
          "Evitar: elementos infantiles, estilo caricatura, baja calidad, texto en otro idioma, errores ortográficos, marcas registradas. " +
          "Brief (usar como fuente de verdad): " +
          String(prompt),
        size: "1024x1024",
        response_format: "b64_json",
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ status: "error", message: err.error?.message || "OpenAI error" });
    }

    const data = await response.json();
    const b64 = data?.data?.[0]?.b64_json || "";

    if (!b64) {
      return res.status(500).json({ status: "error", message: "No se recibió imagen" });
    }

    res.json({ status: "success", image: "data:image/png;base64," + b64 });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== MEMBRESÍA: PLANES =====
app.get("/api/planes", async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM planes WHERE activo = true ORDER BY orden ASC"
    );
    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/suscripcion/info", checkMembership, async (req, res) => {
  try {
    if (!req.subscription) {
      return res.status(403).json({ status: "error", message: "Sin suscripción activa" });
    }

    // Obtener próximo pago
    const pagoResult = await pool.query(
      `SELECT * FROM pagos 
       WHERE aseguradora_id = $1 AND estado = 'COMPLETADO'
       ORDER BY created_at DESC LIMIT 1`,
      [req.subscription.aseguradora_id]
    );

    const ultimoPago = pagoResult.rows[0];

    res.json({
      status: "success",
      data: {
        plan: req.subscription.plan_nombre,
        estado: req.subscription.estado,
        fecha_inicio: req.subscription.fecha_inicio,
        fecha_fin: req.subscription.fecha_fin,
        fecha_proximo_pago: req.subscription.fecha_proximo_pago,
        auto_renovacion: req.subscription.auto_renovacion,
        es_anual: req.subscription.es_anual,
        ultimo_pago: ultimoPago,
      },
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: CREAR INVITACIONES =====
app.post("/api/admin/invitaciones/crear", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const { plan_id, email, cantidad = 1, dias_expiracion = 30, pais, paises } = req.body;

    // Asegurar que la tabla tenga columnas pais/paises (compatibilidad DB vieja)
    await ensureInvitacionesPaisSchema();

    const paisNorm = normalizePais(pais);
    const paisesNorm = normalizePaisList(paises, paisNorm);

    const invitaciones = [];
    for (let i = 0; i < cantidad; i++) {
      const codigo = crypto.randomBytes(16).toString("hex").toUpperCase().slice(0, 12);
      const expiracion = new Date();
      expiracion.setDate(expiracion.getDate() + dias_expiracion);

      const result = await db.query(
        `INSERT INTO invitaciones (codigo, plan_id, email, expira_en, pais, paises, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW()) RETURNING id, codigo, email, expira_en, pais, paises`,
        [codigo, plan_id, email || null, expiracion, paisNorm, paisesNorm]
      );

      invitaciones.push(result.rows[0]);
    }

    res.json({
      status: "success",
      message: `${cantidad} invitación(es) creada(s)`,
      data: invitaciones,
    });

    await logAudit(admin.usuario_id, "INVITACIONES_CREADAS", "invitaciones", { cantidad, plan_id });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.get("/api/admin/invitaciones/listar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const result = await db.query(`
      SELECT i.*, p.nombre as plan_nombre 
      FROM invitaciones i
      JOIN planes p ON i.plan_id = p.id
      ORDER BY i.created_at DESC
    `);

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: USUARIOS (setear pais/paises) =====
app.get("/api/admin/usuarios/listar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    await ensureUsuariosPaisSchema();

    const result = await db.query(
      "SELECT id, nombre, email, rol, pais, paises, created_at FROM usuarios ORDER BY id DESC"
    );
    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/api/admin/usuarios/set-paises", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const { user_id, pais, paises } = req.body || {};
    if (!user_id) {
      return res.status(400).json({ status: "error", message: "user_id requerido" });
    }

    await ensureUsuariosPaisSchema();

    const paisNorm = normalizePais(pais);
    let paisesNorm = normalizePaisList(paises, paisNorm);
    if (!paisesNorm.split(",").includes(paisNorm)) {
      paisesNorm = normalizePaisList(`${paisesNorm},${paisNorm}`, paisNorm);
    }

    const updated = await db.query(
      "UPDATE usuarios SET pais = $1, paises = $2 WHERE id = $3 RETURNING id, nombre, email, rol, pais, paises",
      [paisNorm, paisesNorm, Number(user_id)]
    );

    if (updated.rows.length === 0) {
      return res.status(404).json({ status: "error", message: "Usuario no encontrado" });
    }

    res.json({ status: "success", data: updated.rows[0] });
    await logAudit(admin.usuario_id, "ADMIN_SET_PAISES", "usuarios", {
      user_id: Number(user_id),
      pais: paisNorm,
      paises: paisesNorm,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: LISTAR SUSCRIPCIONES =====
app.get("/api/admin/suscripciones/listar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const result = await db.query(`
      SELECT s.*, a.nombre as aseguradora_nombre, p.nombre as plan_nombre
      FROM suscripciones s
      JOIN aseguradoras a ON s.aseguradora_id = a.id
      JOIN planes p ON s.plan_id = p.id
      ORDER BY s.fecha_inicio DESC
    `);

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: CAMBIAR PLAN =====
app.post("/api/admin/suscripciones/cambiar-plan", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const { suscripcion_id, nuevo_plan_id } = req.body;

    const result = await db.query(
      "UPDATE suscripciones SET plan_id = $1, fecha_modificacion = NOW() WHERE id = $2 RETURNING *",
      [nuevo_plan_id, suscripcion_id]
    );

    await logAudit(admin.usuario_id, "PLAN_CAMBIADO", "suscripciones", { suscripcion_id, nuevo_plan_id });

    res.json({ status: "success", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: CANCELAR SUSCRIPCIÓN =====
app.post("/api/admin/suscripciones/cancelar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const { suscripcion_id } = req.body;

    const result = await db.query(
      "UPDATE suscripciones SET estado = 'cancelada', fecha_cancelacion = NOW() WHERE id = $1 RETURNING *",
      [suscripcion_id]
    );

    await logAudit(admin.usuario_id, "SUSCRIPCION_CANCELADA", "suscripciones", { suscripcion_id });

    res.json({ status: "success", data: result.rows[0] });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: LISTAR PAGOS =====
app.get("/api/admin/pagos/listar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const result = await db.query(`
      SELECT p.*, a.nombre as aseguradora_nombre
      FROM pagos p
      JOIN aseguradoras a ON p.aseguradora_id = a.id
      ORDER BY p.fecha_creacion DESC
    `);

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: LISTAR PLANES =====
app.get("/api/admin/planes/listar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const result = await db.query(`
      SELECT 
        p.*,
        COUNT(DISTINCT s.aseguradora_id) as usuarios_activos,
        COUNT(DISTINCT s.id) FILTER (WHERE UPPER(s.estado) = 'ACTIVA') as suscripciones_activas
      FROM planes p
      LEFT JOIN suscripciones s ON p.id = s.plan_id
      GROUP BY p.id
      ORDER BY p.id
    `);

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: LISTAR AUDITORÍA =====
app.get("/api/admin/auditoria/listar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const result = await db.query(`
      SELECT * FROM auditoria
      ORDER BY timestamp DESC
      LIMIT 500
    `);

    res.json({ status: "success", data: result.rows });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== ADMIN: ELIMINAR INVITACIÓN =====
app.post("/api/admin/invitaciones/eliminar", async (req, res) => {
  try {
    const admin = await requireAdminAccess(req);
    if (!admin.ok) return res.status(admin.status).json({ status: "error", message: admin.message });

    const { id } = req.body;

    await db.query("DELETE FROM invitaciones WHERE id = $1", [id]);
    await logAudit(admin.usuario_id, "INVITACION_ELIMINADA", "invitaciones", { id });

    res.json({ status: "success" });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== AUTH POR EMAIL =====
app.post("/send-code", async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ status: "error", message: "Email requerido" });

    const emailRaw = String(email || "").trim();

    if (dbConnected) {
      const purpose = `aseg_login:${normalizeEmailLower(emailRaw)}`;
      await createEmailCodeAndSend({ email: emailRaw, purpose });
      return res.json({ status: "success", message: "Código enviado a tu email" });
    }

    const result = await sendVerificationCode(emailRaw);
    res.json({ status: result.success ? "success" : "error", message: result.message });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

app.post("/verify-code", async (req, res) => {
  try {
    const { email, code, pais } = req.body;
    if (!email || !code) return res.status(400).json({ status: "error", message: "Email y código requeridos" });

    const emailRaw = String(email || "").trim();

    const paisNorm = ["AR", "UY"].includes(String(pais || "").toUpperCase())
      ? String(pais).toUpperCase()
      : "AR";

    if (dbConnected) {
      const purpose = `aseg_login:${normalizeEmailLower(emailRaw)}`;
      const v = await verifyEmailCodeByPurpose({ purpose, code: String(code).trim() });
      if (!v?.valid) {
        return res.status(401).json({ status: "error", message: v?.message || "Código inválido" });
      }
    } else {
      const result = verifyCode(emailRaw, String(code).trim());
      if (!result.valid) {
        return res.status(401).json({ status: "error", message: result.message });
      }
    }

    // Buscar o crear usuario
    let user = await pool.query("SELECT * FROM usuarios WHERE email = $1", [emailRaw]);

    if (user.rows.length === 0) {
      // Crear usuario nuevo
      await pool.query(
        "INSERT INTO usuarios (nombre, email, password, rol, pais, paises) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          emailRaw.split("@")[0],
          emailRaw,
          await bcrypt.hash(crypto.randomBytes(16).toString("hex"), 10),
          "user",
          paisNorm,
          paisNorm,
        ]
      );
      user = await pool.query("SELECT * FROM usuarios WHERE email = $1", [emailRaw]);
    }

    // Si ya existe pero no tiene pais/paises seteado, setearlo una vez
    if (user.rows.length > 0) {
      const current = user.rows[0];
      const currentPais = String(current.pais || "").trim();
      const currentPaises = String(current.paises || "").trim();
      if (!currentPais || !currentPaises) {
        await pool.query("UPDATE usuarios SET pais = $1, paises = COALESCE(NULLIF(TRIM(paises), ''), $1) WHERE id = $2", [paisNorm, current.id]);
        user = await pool.query("SELECT * FROM usuarios WHERE email = $1", [emailRaw]);
      }
    }

    const userData = user.rows[0];
    const token = jwt.sign(
      { id: userData.id, email: userData.email, rol: userData.rol },
      jwtSecret,
      { expiresIn: "7d" }
    );

    res.json({
      status: "success",
      user: {
        id: userData.id,
        email: userData.email,
        nombre: userData.nombre,
        rol: userData.rol,
        pais: userData.pais || "AR",
        paises: userData.paises || userData.pais || "AR",
        profile_photo_dataurl: getProfilePhotoDataUrlFromUserRow(userData),
      },
      token,
    });
  } catch (err) {
    res.status(500).json({ status: "error", message: err.message });
  }
});

// ===== SPA FALLBACK (React Router / rutas client-side) =====
if (hasFrontendBuild) {
  app.get("*", (req, res, next) => {
    if (req.method !== "GET") return next();
    if (req.path.startsWith("/api")) return next();
    if (req.path === "/health") return next();
    if (req.path.includes(".")) return next();

    res.setHeader("Cache-Control", "no-store, max-age=0");
    return res.sendFile(distIndexHtml);
  });
}

// ===== ERROR HANDLER =====
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ status: "error", message: err.message });
});

const PORT = process.env.PORT || 5000;
// En contenedores/producción (EasyPanel), lo más compatible es escuchar en IPv4.
// En dev local, '::' permite localhost (IPv6) y 127.0.0.1 (IPv4).
const LISTEN_HOST = String(process.env.HOST || "").trim() || (isProd() ? "0.0.0.0" : "::");
const server = app.listen(PORT, LISTEN_HOST, () => {
  const hostLabel = LISTEN_HOST === "0.0.0.0" ? "0.0.0.0" : "localhost";
  console.log(`🚀 Backend SegurosPro en http://${hostLabel}:${PORT}`);
});

server.on("error", (err) => {
  if (err?.code === "EADDRINUSE") {
    console.error(`❌ Puerto ${PORT} ocupado. Cerrá el proceso que lo usa y reintentá (o cambiá PORT en .env).`);
    process.exit(1);
  }
  if (err?.code === "EACCES") {
    console.error(`❌ Sin permisos para abrir el puerto ${PORT}. Ejecutá PowerShell como admin o usá otro PORT.`);
    process.exit(1);
  }
  console.error("❌ Error iniciando el servidor:", err);
  process.exit(1);
});

