import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const email = String(process.argv[2] || "").trim().toLowerCase();
const role = String(process.argv[3] || "").trim().toLowerCase();

if (!email || !role) {
  console.error("Usage: node scripts/set-user-role.mjs <email> <role>");
  console.error("Example: node scripts/set-user-role.mjs user@mail.com user");
  process.exit(1);
}

const allowed = new Set(["user", "admin"]);
if (!allowed.has(role)) {
  console.error("Role inválido. Usá: user | admin");
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
  const before = await pool.query(
    "SELECT id, email, nombre, rol, pais, paises FROM usuarios WHERE LOWER(email)=LOWER($1)",
    [email]
  );
  if (before.rows.length === 0) {
    console.error("No existe un usuario con ese email.");
    process.exitCode = 1;
    process.exit();
  }

  const after = await pool.query(
    "UPDATE usuarios SET rol=$2 WHERE LOWER(email)=LOWER($1) RETURNING id, email, nombre, rol, pais, paises",
    [email, role]
  );

  console.log("OK: rol actualizado:", after.rows[0]);
} finally {
  await pool.end();
}
