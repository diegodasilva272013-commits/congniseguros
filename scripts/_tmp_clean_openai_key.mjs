import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const tenantDb = process.argv[2];
if (!tenantDb) {
  console.error("Usage: node scripts/_tmp_clean_openai_key.mjs <tenantDbName>");
  process.exit(2);
}

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432),
  database: tenantDb,
});

try {
  const r = await pool.query("DELETE FROM configuracion WHERE key='openai_api_key'");
  console.log("deleted", r.rowCount);
} finally {
  await pool.end();
}
