import "dotenv/config";
import bcrypt from "bcrypt";
import pkg from "pg";

const { Pool } = pkg;

const email = String(process.argv[2] || "").trim();
const password = String(process.argv[3] || "");

if (!email || !password) {
  console.error("Usage: node scripts/set-user-password.mjs <email> <password>");
  process.exit(1);
}

const masterDb = process.env.DB_NAME || "cogniseguros";
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: masterDb,
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
});

try {
  const hash = await bcrypt.hash(password, 12);
  const r = await pool.query(
    "UPDATE usuarios SET password = $1 WHERE LOWER(email) = LOWER($2) RETURNING id, email, nombre, rol",
    [hash, email]
  );

  if (r.rows.length === 0) {
    console.error("No existe usuario con ese email.");
    process.exitCode = 1;
  } else {
    console.log("OK: password actualizada para:", r.rows[0]);
  }
} finally {
  await pool.end();
}
