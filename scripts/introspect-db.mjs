import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const aseguradoraId = String(process.argv[2] || "").trim();
if (!aseguradoraId) {
  console.error("Usage: node scripts/introspect-db.mjs <aseguradora_id>");
  process.exit(1);
}

const env = process.env;

const cfg = {
  user: env.DB_USER ? env.DB_USER : "postgres",
  host: env.DB_HOST ? env.DB_HOST : "localhost",
  password: env.DB_PASSWORD ? env.DB_PASSWORD : "postgres",
  port: Number(env.DB_PORT ? env.DB_PORT : 5432),
};

const masterDb = env.DB_NAME ? env.DB_NAME : "cogniseguros";

const nonSecretEnv = {
  NODE_ENV: env.NODE_ENV || null,
  DB_HOST: env.DB_HOST || null,
  DB_PORT: env.DB_PORT || null,
  DB_NAME: env.DB_NAME || null,
  DB_USER: env.DB_USER || null,
  DB_ADMIN_DB: env.DB_ADMIN_DB || null,
  TENANT_DB_PREFIX: env.TENANT_DB_PREFIX || null,
};

const toJson = (x) => JSON.stringify(x, null, 2);

const listTables = async (pool) => {
  const r = await pool.query(
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_type='BASE TABLE' AND table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name"
  );
  return r.rows;
};

const describeTable = async (pool, { schema, table }) => {
  const r = await pool.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position",
    [schema, table]
  );
  return r.rows;
};

const main = async () => {
  console.log("ENV(non-secret):", toJson(nonSecretEnv));
  console.log("MASTER connect:", toJson({ ...cfg, database: masterDb, password: "<redacted>" }));

  const master = new Pool({ ...cfg, database: masterDb });

  try {
    const sp = await master.query("SHOW search_path");
    console.log("MASTER search_path:", sp.rows[0]?.search_path);

    const tables = await listTables(master);
    console.log("MASTER tables:", toJson(tables));

    const masterClientesCols = await describeTable(master, { schema: "public", table: "clientes" });
    console.log("MASTER public.clientes columns:", toJson(masterClientesCols));

    const u = await master.query("SELECT id, tenant_db FROM usuarios WHERE id::text = $1 LIMIT 1", [aseguradoraId]);
    console.log(`USUARIO(id=${aseguradoraId}):`, toJson(u.rows));

    const prefix = env.TENANT_DB_PREFIX ? env.TENANT_DB_PREFIX : "cogniseguros_tenant_";
    const row = u.rows.length ? u.rows[0] : { id: aseguradoraId, tenant_db: "" };
    const tenantDb = row.tenant_db && String(row.tenant_db).trim() ? String(row.tenant_db).trim() : prefix + String(row.id || aseguradoraId);

    console.log("TENANT DB chosen:", tenantDb);
    console.log("TENANT connect:", toJson({ ...cfg, database: tenantDb, password: "<redacted>" }));

    const tenant = new Pool({ ...cfg, database: tenantDb });
    try {
      const tsp = await tenant.query("SHOW search_path");
      console.log("TENANT search_path:", tsp.rows[0]?.search_path);

      const tt = await listTables(tenant);
      console.log("TENANT tables:", toJson(tt));

      const tenantClientesCols = await describeTable(tenant, { schema: "public", table: "clientes" });
      console.log("TENANT public.clientes columns:", toJson(tenantClientesCols));
    } finally {
      await tenant.end();
    }
  } finally {
    await master.end();
  }
};

main().catch((e) => {
  console.error("INTROSPECTION ERROR:", e?.message || String(e));
  process.exit(1);
});
