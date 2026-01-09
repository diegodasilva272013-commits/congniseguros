import "dotenv/config";
import pkg from "pg";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { Pool } = pkg;

const cfg = {
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
};

const masterDb = process.env.DB_NAME || "cogniseguros";
const master = new Pool({ ...cfg, database: masterDb });

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationPath = path.resolve(__dirname, "..", "migrations", "20260109_whatsapp_inbox_mvp.sql");

const splitSqlStatements = (sqlText) => {
  // Suficientemente robusto para nuestro archivo (maneja strings simples y comentarios --).
  const statements = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;

  for (let i = 0; i < sqlText.length; i += 1) {
    const ch = sqlText[i];
    const next = sqlText[i + 1];

    if (inLineComment) {
      if (ch === "\n") {
        inLineComment = false;
        current += ch;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === "-" && next === "-") {
      inLineComment = true;
      i += 1;
      continue;
    }

    if (!inDoubleQuote && ch === "'" && !inSingleQuote) {
      inSingleQuote = true;
      current += ch;
      continue;
    }

    if (inSingleQuote && ch === "'") {
      // escape ''
      if (next === "'") {
        current += "''";
        i += 1;
        continue;
      }
      inSingleQuote = false;
      current += ch;
      continue;
    }

    if (!inSingleQuote && ch === '"') {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote && ch === ";") {
      const stmt = current.trim();
      if (stmt) statements.push(stmt);
      current = "";
      continue;
    }

    current += ch;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
};

const runSqlFileOnDatabase = async ({ database, sqlText }) => {
  const tenant = new Pool({ ...cfg, database });
  try {
    const statements = splitSqlStatements(sqlText);
    for (const stmt of statements) {
      await tenant.query(stmt);
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, code: err?.code, message: err?.message || String(err) };
  } finally {
    await tenant.end().catch(() => {});
  }
};

if (!fs.existsSync(migrationPath)) {
  console.error("Migration file not found:", migrationPath);
  process.exit(1);
}

const sqlText = fs.readFileSync(migrationPath, "utf8");

try {
  const r = await master.query(
    "SELECT id, COALESCE(NULLIF(TRIM(tenant_db), ''), 'cogniseguros_tenant_' || id::text) AS tenant_db FROM usuarios ORDER BY id ASC"
  );
  const tenants = r.rows;

  let okCount = 0;
  let failCount = 0;

  for (const t of tenants) {
    const tenantDb = t.tenant_db;
    const result = await runSqlFileOnDatabase({ database: tenantDb, sqlText });

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
  await master.end().catch(() => {});
}
