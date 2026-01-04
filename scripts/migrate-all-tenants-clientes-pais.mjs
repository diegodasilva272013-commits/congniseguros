import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const cfg = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
};

const masterDb = process.env.DB_NAME || "cogniseguros";
const master = new Pool({ ...cfg, database: masterDb });

const runTenantMigration = async (tenantDb) => {
  const tenant = new Pool({ ...cfg, database: tenantDb });
  try {
    await tenant.query("BEGIN");
    await tenant.query("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR'");
    await tenant.query("UPDATE clientes SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''");
    await tenant.query("DROP INDEX IF EXISTS ux_clientes_documento");
    await tenant.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pais_documento ON clientes(pais, documento)");
    await tenant.query("COMMIT");
    return { ok: true };
  } catch (err) {
    await tenant.query("ROLLBACK").catch(() => {});
    return { ok: false, code: err?.code, message: err?.message || String(err) };
  } finally {
    await tenant.end();
  }
};

try {
  const r = await master.query("SELECT id, COALESCE(NULLIF(TRIM(tenant_db), ''), 'cogniseguros_tenant_' || id::text) AS tenant_db FROM usuarios ORDER BY id ASC");
  const tenants = r.rows;

  let okCount = 0;
  let failCount = 0;

  for (const t of tenants) {
    const tenantDb = t.tenant_db;
    const result = await runTenantMigration(tenantDb);
    if (result.ok) {
      okCount += 1;
      console.log(`OK   user_id=${t.id} db=${tenantDb}`);
    } else {
      failCount += 1;
      console.log(`FAIL user_id=${t.id} db=${tenantDb} (${result.code}) ${result.message}`);
    }
  }

  console.log(`\nDone. OK=${okCount} FAIL=${failCount}`);
  if (failCount > 0) process.exitCode = 1;
} finally {
  await master.end();
}
