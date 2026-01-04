import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const email = String(process.argv[2] || "").trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/make-admin.mjs <email>");
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
  const before = await pool.query("SELECT id, email, nombre, rol, pais, paises FROM usuarios WHERE LOWER(email)=LOWER($1)", [email]);
  if (before.rows.length === 0) {
    console.error("No existe un usuario con ese email.");
    process.exitCode = 1;
    process.exit();
  }

  const u = before.rows[0];
  if (String(u.rol || "").toLowerCase() === "admin") {
    console.log("OK: ya es admin:", u);
    process.exit();
  }

  const after = await pool.query(
    "UPDATE usuarios SET rol='admin' WHERE LOWER(email)=LOWER($1) RETURNING id, email, nombre, rol, pais, paises",
    [email]
  );
  console.log("OK: actualizado a admin:", after.rows[0]);
} finally {
  await pool.end();
}
