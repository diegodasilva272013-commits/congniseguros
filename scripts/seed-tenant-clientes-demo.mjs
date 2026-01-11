import "dotenv/config";
import pkg from "pg";
import fs from "fs";
import path from "path";

const { Pool } = pkg;

const idOrEmail = String(process.argv[2] || "").trim();
const countArg = process.argv[3];
const count = Number(countArg || 300);

const reset = process.argv.includes("--reset");
const wipeDemo = process.argv.includes("--wipe-demo");

if (!Number.isFinite(count) || count <= 0) {
  console.error("Invalid count. Must be a positive number.");
  process.exit(1);
}

const cfg = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
};

const masterDb = process.env.DB_NAME || "cogniseguros";
const adminDb = process.env.DB_ADMIN_DB || "postgres";
const master = new Pool({ ...cfg, database: masterDb });

const today = new Date();
const y = today.getFullYear();
const m = String(today.getMonth() + 1).padStart(2, "0");
const d = String(today.getDate()).padStart(2, "0");
const stamp = `${y}${m}${d}`;
// Tenant schema: clientes.documento es VARCHAR(20). Usamos prefijo corto + secuencia.
// Ej: D2601080000123 (14 chars)
const docPrefix = `D${stamp.slice(2)}`;

const getTenantDbNameForUserId = (id) => `${process.env.TENANT_DB_PREFIX || "cogniseguros_tenant_"}${id}`;

if (!idOrEmail) {
  console.error(
    "Usage: node scripts/seed-tenant-clientes-demo.mjs <aseguradoraId|email> [count=300] [--reset] [--wipe-demo]"
  );
  process.exit(1);
}

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let aseguradoraId = "";

if (idOrEmail.includes("@")) {
  const u = await master.query("SELECT id FROM usuarios WHERE lower(email) = lower($1) LIMIT 1", [idOrEmail]);
  aseguradoraId = String(u.rows[0]?.id || "").trim();
  if (!aseguradoraId) {
    console.error("No se encontró usuario con ese email en master. Email:", idOrEmail);
    process.exit(1);
  }
} else if (uuidRe.test(idOrEmail)) {
  aseguradoraId = idOrEmail;
} else if (/^\d+$/.test(idOrEmail)) {
  aseguradoraId = idOrEmail;
} else {
  console.error("Identificador inválido. Pasá un UUID, un ID numérico o un email. Recibido:", idOrEmail);
  process.exit(1);
}

const r2 = await master.query("SELECT tenant_db FROM usuarios WHERE id::text = $1 LIMIT 1", [aseguradoraId]);
const tenantDb = (r2.rows[0]?.tenant_db || "").trim() || getTenantDbNameForUserId(aseguradoraId);

console.log("aseguradoraId:", aseguradoraId);
console.log("tenantDb:", tenantDb);
console.log("count:", count);
console.log("docPrefix:", docPrefix);

const ensureTenantDbExists = async () => {
  const admin = new Pool({ ...cfg, database: adminDb });
  try {
    const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [tenantDb]);
    if (exists.rows.length === 0) {
      const safeDbName = String(tenantDb).replace(/"/g, '""');
      await admin.query(`CREATE DATABASE "${safeDbName}"`);
      console.log("tenant_db_created:", tenantDb);
    }
  } finally {
    await admin.end();
  }
};

await ensureTenantDbExists();

const tenant = new Pool({ ...cfg, database: tenantDb });

const loadTenantSchemaSql = () => {
  try {
    const schemaPath = path.resolve(process.cwd(), "tenant-schema.sql");
    return fs.readFileSync(schemaPath, "utf8");
  } catch {
    return `
      CREATE TABLE IF NOT EXISTS clientes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        pais VARCHAR(2) DEFAULT 'AR',
        nombre VARCHAR(255) NOT NULL,
        apellido VARCHAR(255),
        mail VARCHAR(255),
        telefono VARCHAR(20),
        documento VARCHAR(20),
        polizas TEXT,
        descripcion_seguro TEXT,
        fecha_inicio_str VARCHAR(50),
        fecha_fin_str VARCHAR(50),
        fechas_de_cuota TEXT,
        cuota_paga VARCHAR(10) DEFAULT 'NO',
        monto DECIMAL(10, 2),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
  }
};

const ensureTenantClientesSchema = async () => {
  await tenant.query("BEGIN");
  try {
    // Ensure base schema exists
    try {
      await tenant.query("SELECT 1 FROM clientes LIMIT 1");
    } catch {
      const schemaSql = loadTenantSchemaSql();
      await tenant.query(schemaSql);
    }

    // Ensure pais column + unique index used by the app
    await tenant.query("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR'");
    await tenant.query("UPDATE clientes SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''");
    await tenant.query("DROP INDEX IF EXISTS ux_clientes_documento");
    await tenant.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pais_documento ON clientes(pais, documento)");

    await tenant.query("COMMIT");
  } catch (err) {
    await tenant.query("ROLLBACK").catch(() => {});
    throw err;
  }
};

const wipeDemoRows = async () => {
  const like = "DEMO-%";
  const del = await tenant.query("DELETE FROM clientes WHERE documento LIKE $1", [like]);
  console.log("deleted_demo_rows:", del.rowCount);
};

const wipePrefixRows = async () => {
  const like = `${docPrefix}%`;
  const del = await tenant.query("DELETE FROM clientes WHERE documento LIKE $1", [like]);
  console.log("deleted_prefix_rows:", del.rowCount);
};

const seedSql = `
WITH seed AS (
  SELECT
    ARRAY['AR','UY','PY','CL','BO']::text[] AS paises,
    ARRAY['Juan','María','Pedro','Ana','Lucas','Sofía','Diego','Luz','Martín','Carla','Nicolás','Valentina','Bruno','Flor','Tomás','Agustina','Joaquín','Micaela']::text[] AS nombres,
    ARRAY['Gómez','Pérez','Rodríguez','Fernández','López','Martínez','García','Sánchez','Romero','Díaz','Torres','Flores','Acosta','Herrera','Silva','Ramos','Sosa','Castro']::text[] AS apellidos,
    ARRAY['AUTOMOTOR','HOGAR','MOTO','VIDA','COMERCIO','SALUD']::text[] AS rubros
),
params AS (
  SELECT
    $1::int AS total,
    $2::text AS doc_prefix
),
g AS (
  SELECT generate_series(1, (SELECT total FROM params)) AS n
),
mix AS (
  SELECT
    n,
    (SELECT total FROM params) AS total,
    CASE
      WHEN n <= floor((SELECT total FROM params) * 0.35) THEN 'SI'
      WHEN n <= floor((SELECT total FROM params) * 0.75) THEN 'NO'
      ELSE 'NO'
    END AS cuota_paga,
    CASE
      WHEN n <= floor((SELECT total FROM params) * 0.35) THEN (CURRENT_DATE + (10 + (n % 120)) * INTERVAL '1 day')::date
      WHEN n <= floor((SELECT total FROM params) * 0.75) THEN (CURRENT_DATE - (5 + (n % 90)) * INTERVAL '1 day')::date
      ELSE (CURRENT_DATE + (1 + (n % 10)) * INTERVAL '1 day')::date
    END AS fecha_fin,
    (CURRENT_DATE - (20 + (n % 120)) * INTERVAL '1 day')::date AS fecha_inicio
  FROM g
)
INSERT INTO clientes (
  fecha_alta,
  pais,
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
  updated_at
)
SELECT
  NOW() - (random() * INTERVAL '180 days') AS fecha_alta,
  s.paises[(floor(random() * array_length(s.paises, 1)) + 1)::int] AS pais,
  s.nombres[(floor(random() * array_length(s.nombres, 1)) + 1)::int] AS nombre,
  s.apellidos[(floor(random() * array_length(s.apellidos, 1)) + 1)::int] AS apellido,
  ('cliente' || m.n::text || '@demo.cogniseguros.local') AS mail,
  ('+54911' || lpad((10000000 + (m.n % 90000000))::text, 8, '0')) AS telefono,
  ((SELECT doc_prefix FROM params) || lpad(m.n::text, 7, '0')) AS documento,
  (s.rubros[(floor(random() * array_length(s.rubros, 1)) + 1)::int] || ' #' || (1000+m.n)::text) AS polizas,
  ('0800-' || lpad((1000 + (m.n % 9000))::text, 4, '0')) AS grua_telefono,
  (CASE WHEN random() < 0.5 THEN 'Grúa Norte' ELSE 'Auxilio 24hs' END) AS grua_nombre,
  ('Cobertura ' || s.rubros[(floor(random() * array_length(s.rubros, 1)) + 1)::int]) AS descripcion_seguro,
  to_char(m.fecha_inicio, 'YYYY-MM-DD') AS fecha_inicio_str,
  to_char(m.fecha_fin, 'YYYY-MM-DD') AS fecha_fin_str,
  (
    to_char((date_trunc('month', m.fecha_fin)::date - INTERVAL '2 months')::date, 'YYYY-MM-DD') || ',' ||
    to_char((date_trunc('month', m.fecha_fin)::date - INTERVAL '1 months')::date, 'YYYY-MM-DD') || ',' ||
    to_char(date_trunc('month', m.fecha_fin)::date, 'YYYY-MM-DD')
  ) AS fechas_de_cuota,
  m.cuota_paga,
  round(((random()*9000 + 500)::numeric), 2) AS monto,
  NOW() AS updated_at
FROM mix m
CROSS JOIN seed s
ON CONFLICT (pais, documento) DO NOTHING;
`;

try {
  await ensureTenantClientesSchema();

  if (wipeDemo) {
    await wipeDemoRows();
  } else if (reset) {
    await wipePrefixRows();
  }

  const ins = await tenant.query(seedSql, [count, docPrefix]);
  console.log("seed_done");
  console.log("insert_command_rowCount:", ins.rowCount);

  const stats = await tenant.query(
    `SELECT
      COUNT(*)::int AS total,
      SUM(CASE WHEN lower(trim(cuota_paga)) IN ('si','sí','s','1','true','pagado','pago','paga') THEN 1 ELSE 0 END)::int AS al_dia,
      SUM(CASE WHEN lower(trim(cuota_paga)) IN ('no','n','0','false','impago','moroso','vencida','vencido') THEN 1 ELSE 0 END)::int AS vencida,
      SUM(CASE WHEN (fecha_fin_str ~ '^\\d{4}-\\d{2}-\\d{2}$') AND (fecha_fin_str::date < CURRENT_DATE) THEN 1 ELSE 0 END)::int AS fin_pasado,
      SUM(CASE WHEN (fecha_fin_str ~ '^\\d{4}-\\d{2}-\\d{2}$') AND (fecha_fin_str::date >= CURRENT_DATE) THEN 1 ELSE 0 END)::int AS fin_futuro
    FROM clientes
    WHERE documento LIKE $1`,
    [`${docPrefix}%`]
  );

  console.log("seed_stats:", stats.rows[0]);
} catch (err) {
  console.error("FAILED:", err?.code, err?.message || err);
  process.exitCode = 1;
} finally {
  await master.end();
  await tenant.end();
}
