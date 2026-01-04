import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const aseguradoraId = Number(process.argv[2] || "");
if (!Number.isFinite(aseguradoraId)) {
  console.error("Usage: node scripts/migrate-tenant-clientes-pais.mjs <aseguradoraId>");
  process.exit(1);
}

const cfg = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
};

const masterDb = process.env.DB_NAME || "cogniseguros";
const master = new Pool({ ...cfg, database: masterDb });

const r = await master.query("SELECT tenant_db FROM usuarios WHERE id = $1", [aseguradoraId]);
const tenantDb = r.rows[0]?.tenant_db || `cogniseguros_tenant_${aseguradoraId}`;

console.log("tenantDb:", tenantDb);

const tenant = new Pool({ ...cfg, database: tenantDb });

try {
  await tenant.query("BEGIN");
  await tenant.query("ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR'");
  await tenant.query("UPDATE clientes SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = ''");
  await tenant.query("DROP INDEX IF EXISTS ux_clientes_documento");
  await tenant.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pais_documento ON clientes(pais, documento)");
  await tenant.query("COMMIT");

  const cols = await tenant.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes' ORDER BY ordinal_position"
  );
  console.log("tenant_clientes_cols:", cols.rows.map((c) => c.column_name));
  console.log("OK: clientes.pais ensured");
} catch (err) {
  await tenant.query("ROLLBACK").catch(() => {});
  console.error("FAILED:", err?.code, err?.message || err);
  process.exitCode = 1;
} finally {
  await master.end();
  await tenant.end();
}
