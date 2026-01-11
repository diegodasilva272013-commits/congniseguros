import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import pkg from "pg";

const { Pool } = pkg;

function parsePostgresUrl(rawUrl) {
  if (!rawUrl) return null;
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`Unsupported DATABASE_URL protocol: ${url.protocol}`);
  }

  const databaseFromPath = url.pathname?.replace(/^\//, "");
  const port = url.port ? Number(url.port) : 5432;
  const sslMode = url.searchParams.get("sslmode");

  return {
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    host: url.hostname,
    port,
    database: databaseFromPath || undefined,
    ssl:
      sslMode === "require" || sslMode === "verify-full" || sslMode === "verify-ca"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

function getDbUrlFromEnv() {
  return (
    process.env.DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PGURL ||
    ""
  ).trim();
}

function getPgConfig({ databaseOverride } = {}) {
  const dbUrl = getDbUrlFromEnv();
  if (dbUrl) {
    const parsed = parsePostgresUrl(dbUrl);
    return {
      user: parsed.user,
      host: parsed.host,
      database: databaseOverride || parsed.database,
      password: parsed.password,
      port: parsed.port,
      ssl: parsed.ssl,
    };
  }

  return {
    user: process.env.DB_USER || process.env.PGUSER || "postgres",
    host: process.env.DB_HOST || process.env.PGHOST || "localhost",
    database: databaseOverride || process.env.DB_NAME || process.env.PGDATABASE || "cogniseguros",
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || "postgres",
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  };
}

const MIGRATIONS_DIR = path.resolve(process.cwd(), "migrations");
const MASTER_DB = (process.env.DB_NAME || "cogniseguros").trim();
const ADMIN_DB = (process.env.DB_ADMIN_DB || "postgres").trim();

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run") || String(process.env.MIGRATE_DRY_RUN || "").trim() === "1";
const BASELINE = args.has("--baseline") || String(process.env.MIGRATE_BASELINE || "").trim() === "1";
const TENANTS = args.has("--tenants") || String(process.env.MIGRATE_TENANTS || "").trim() === "1";
const CREATE_TENANTS =
  args.has("--create-tenants") ||
  String(process.env.MIGRATE_CREATE_TENANTS || process.env.CREATE_TENANTS || "").trim() === "1";

const APPLIED_BY =
  String(process.env.APP_BUILD_ID || "").trim() ||
  String(process.env.EASYPANEL_GIT_SHA || "").trim() ||
  String(process.env.GIT_SHA || "").trim() ||
  "manual";

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

function detectScope(sqlText) {
  const head = sqlText.split("\n").slice(0, 40).join("\n");
  const m = head.match(/^\s*--\s*scope\s*:\s*(master|tenant|both)\s*$/im);
  return (m?.[1] || "master").toLowerCase();
}

function hasExplicitTransaction(sqlText) {
  const normalized = sqlText
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("--"))
    .slice(0, 50)
    .join("\n")
    .toUpperCase();

  return normalized.includes("BEGIN;") || normalized.includes("BEGIN ") || normalized.includes("COMMIT;");
}

async function ensureMigrationsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      applied_by TEXT,
      execution_ms INT
    );
  `);
  await pool.query("CREATE INDEX IF NOT EXISTS ix_schema_migrations_applied_at ON schema_migrations(applied_at)");
}

async function getAppliedMigration(pool, filename) {
  const r = await pool.query("SELECT filename, checksum FROM schema_migrations WHERE filename = $1", [filename]);
  return r.rows?.[0] || null;
}

async function recordMigration(pool, { filename, checksum, executionMs }) {
  await pool.query(
    `INSERT INTO schema_migrations(filename, checksum, applied_by, execution_ms)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (filename) DO NOTHING`,
    [filename, checksum, APPLIED_BY, executionMs]
  );
}

async function applyMigrationFile({ pool, filename, sqlText, baseline, dryRun }) {
  const checksum = sha256(sqlText);
  const already = await getAppliedMigration(pool, filename);
  if (already) {
    if (already.checksum !== checksum) {
      throw new Error(
        `Migration checksum mismatch for ${filename}. Refusing to run. (DB=${already.checksum} FILE=${checksum})`
      );
    }
    console.log(`SKIP ${filename}`);
    return { applied: false };
  }

  const scope = detectScope(sqlText);
  if (baseline) {
    console.log(`BASELINE ${filename} (scope=${scope})`);
    if (!dryRun) await recordMigration(pool, { filename, checksum, executionMs: 0 });
    return { applied: true, baseline: true };
  }

  console.log(`APPLY ${filename} (scope=${scope})`);
  if (dryRun) return { applied: true, dryRun: true };

  const started = Date.now();
  const explicitTx = hasExplicitTransaction(sqlText);

  const client = await pool.connect();
  try {
    if (!explicitTx) await client.query("BEGIN");
    await client.query(sqlText);
    if (!explicitTx) await client.query("COMMIT");
  } catch (err) {
    if (!explicitTx) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
    }
    throw err;
  } finally {
    client.release();
  }

  const executionMs = Date.now() - started;
  await recordMigration(pool, { filename, checksum, executionMs });
  return { applied: true, executionMs };
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.toLowerCase().endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

function loadTenantSchemaSql() {
  const p = path.resolve(process.cwd(), "tenant-schema.sql");
  if (!fs.existsSync(p)) {
    throw new Error("tenant-schema.sql no encontrado");
  }
  return fs.readFileSync(p, "utf8");
}

async function ensureDatabaseExists({ adminPool, dbName }) {
  const db = String(dbName || "").trim();
  if (!db) throw new Error("dbName requerido");

  const exists = await adminPool.query("SELECT 1 FROM pg_database WHERE datname = $1", [db]);
  if ((exists.rows || []).length > 0) return { created: false };

  if (!CREATE_TENANTS) return { created: false, skipped: true };

  if (DRY_RUN) {
    console.log(`[migrate] DRY_RUN create database: ${db}`);
    return { created: true, dryRun: true };
  }

  try {
    await adminPool.query(`CREATE DATABASE ${db};`);
  } catch (err) {
    // 42P04 = duplicate_database, 23505 = unique_violation
    if (err.code !== "42P04" && err.code !== "23505") throw err;
  }
  return { created: true };
}

async function runMigrationsOnPool({ pool, scopeWanted }) {
  await ensureMigrationsTable(pool);

  const files = listMigrationFiles();
  if (files.length === 0) {
    console.log("No migrations found.");
    return;
  }

  for (const filename of files) {
    const full = path.join(MIGRATIONS_DIR, filename);
    const sqlText = fs.readFileSync(full, "utf8");
    const scope = detectScope(sqlText);

    const shouldRun =
      scopeWanted === "master"
        ? scope === "master" || scope === "both"
        : scope === "tenant" || scope === "both";

    if (!shouldRun) continue;
    await applyMigrationFile({ pool, filename, sqlText, baseline: BASELINE, dryRun: DRY_RUN });
  }
}

async function loadTenants({ masterPool }) {
  try {
    const r = await masterPool.query(
      "SELECT id, COALESCE(NULLIF(TRIM(tenant_db), ''), 'cogniseguros_tenant_' || id::text) AS tenant_db FROM usuarios ORDER BY id ASC"
    );

    const tenants = [];
    for (const row of r.rows || []) {
      const db = String(row.tenant_db || "").trim();
      if (!db) continue;

      tenants.push({ userId: String(row.id), tenantDb: db });
    }

    return tenants;
  } catch (err) {
    console.warn("[migrate] Unable to load tenants from usuarios:", err?.message || err);
    return [];
  }
}

async function main() {
  console.log("[migrate] DB:", {
    master: MASTER_DB,
    dryRun: DRY_RUN,
    baseline: BASELINE,
    tenants: TENANTS,
    createTenants: CREATE_TENANTS,
  });

  const masterPool = new Pool(getPgConfig({ databaseOverride: MASTER_DB }));
  const adminPool = new Pool(getPgConfig({ databaseOverride: ADMIN_DB }));

  try {
    await masterPool.query("SELECT 1");
    await runMigrationsOnPool({ pool: masterPool, scopeWanted: "master" });

    if (TENANTS) {
      const tenants = await loadTenants({ masterPool, adminPool });
      console.log(`[migrate] Tenants detected: ${tenants.length}`);

      for (const t of tenants) {
        // Opcional: crear DB tenant si falta
        try {
          const ensured = await ensureDatabaseExists({ adminPool, dbName: t.tenantDb });
          if (ensured.skipped) {
            console.log(`[migrate] SKIP tenant (db missing): ${t.tenantDb}`);
            continue;
          }
        } catch (e) {
          console.log(`[migrate] FAIL ensure tenant db=${t.tenantDb}: ${e?.message || e}`);
          process.exitCode = 1;
          continue;
        }

        const tenantPool = new Pool(getPgConfig({ databaseOverride: t.tenantDb }));
        try {
          await tenantPool.query("SELECT 1");
          console.log(`[migrate] Tenant user_id=${t.userId} db=${t.tenantDb}`);

          // Asegurar schema base (tenant-schema.sql) si falta
          try {
            await tenantPool.query("SELECT 1 FROM clientes LIMIT 1");
          } catch {
            const schemaSql = loadTenantSchemaSql();
            if (!DRY_RUN) {
              await tenantPool.query(schemaSql);
            } else {
              console.log(`[migrate] DRY_RUN apply tenant-schema.sql -> ${t.tenantDb}`);
            }
          }

          await runMigrationsOnPool({ pool: tenantPool, scopeWanted: "tenant" });
        } catch (err) {
          console.log(`[migrate] FAIL tenant db=${t.tenantDb}: ${err?.message || err}`);
          process.exitCode = 1;
        } finally {
          await tenantPool.end().catch(() => {});
        }
      }
    }
  } finally {
    await masterPool.end().catch(() => {});
    await adminPool.end().catch(() => {});
  }
}

main().catch((err) => {
  const message = err?.message || err;
  console.error("[migrate] Fatal:", message);

  // Helpful Postgres details (when available)
  if (err && typeof err === "object") {
    const details = {
      code: err.code,
      detail: err.detail,
      hint: err.hint,
      where: err.where,
      schema: err.schema,
      table: err.table,
      column: err.column,
      constraint: err.constraint,
      routine: err.routine,
    };

    for (const [key, value] of Object.entries(details)) {
      if (value !== undefined && value !== null && String(value).trim() !== "") {
        console.error(`[migrate] ${key}:`, value);
      }
    }
  }
  process.exit(1);
});
