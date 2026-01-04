import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const userId = Number(process.argv[2] || "3");
if (!Number.isFinite(userId)) {
  console.error("Usage: node scripts/check-tenant-cols.mjs <userId>");
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
const r = await master.query("SELECT id, tenant_db FROM usuarios WHERE id = $1", [userId]);
console.log("master_user:", r.rows);

try {
  const masterCols = await master.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes' ORDER BY ordinal_position"
  );
  console.log("master_clientes_cols:", masterCols.rows);
} catch (err) {
  console.log("master_clientes_cols: <no table or error>", err?.message || err);
}

const tenantDb = r.rows[0]?.tenant_db || `cogniseguros_tenant_${userId}`;
console.log("tenantDb:", tenantDb);

const tenant = new Pool({ ...cfg, database: tenantDb });

try {
  const cols = await tenant.query(
    "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='clientes' ORDER BY ordinal_position"
  );
  console.log("tenant_clientes_cols:", cols.rows);
} catch (err) {
  console.error("tenant query error:", err?.message || err);
} finally {
  await master.end();
  await tenant.end();
}
