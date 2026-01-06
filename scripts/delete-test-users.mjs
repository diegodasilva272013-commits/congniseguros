import "dotenv/config";
import pkg from "pg";

const { Pool } = pkg;

const masterDb = (process.env.DB_NAME || "cogniseguros").trim();
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: masterDb,
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
});

const emails = ["test@test.com", "admin@test.com"];

try {
  const existing = await pool.query(
    "SELECT id, email, rol FROM usuarios WHERE LOWER(email) = ANY($1)",
    [emails.map((e) => e.toLowerCase())]
  );

  if (existing.rows.length === 0) {
    console.log("OK: no hay usuarios de prueba para borrar.");
    process.exit(0);
  }

  console.log("Encontrados:", existing.rows);

  // Borrar dependencias primero (suscripciones referencian usuarios)
  const ids = existing.rows.map((r) => r.id);
  await pool.query("DELETE FROM suscripciones WHERE aseguradora_id = ANY($1)", [ids]);

  const deleted = await pool.query(
    "DELETE FROM usuarios WHERE id = ANY($1) RETURNING id, email",
    [ids]
  );

  console.log("OK: borrados:", deleted.rows);
} finally {
  await pool.end();
}
