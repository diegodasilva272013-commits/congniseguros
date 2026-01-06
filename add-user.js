import pkg from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const email = String(process.argv[2] || "").trim().toLowerCase();
const password = String(process.argv[3] || "");
const name = String(process.argv[4] || "").trim() || "Admin";
const role = String(process.argv[5] || "admin").trim().toLowerCase();
const planName = String(process.argv[6] || "ENTERPRISE").trim().toUpperCase();

if (!email || !password) {
  console.error(
    "Usage: node add-user.js <email> <password> [name] [role=admin] [plan=ENTERPRISE]"
  );
  process.exit(1);
}

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "cogniseguros",
  password: process.env.DB_PASSWORD || "postgres",
  port: Number(process.env.DB_PORT || 5432),
});

const conn = await pool.connect();

try {
  const hashedPassword = await bcrypt.hash(password, 12);

  const upsert = await conn.query(
    `INSERT INTO usuarios (nombre, email, password, rol)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET nombre=EXCLUDED.nombre, password=EXCLUDED.password, rol=EXCLUDED.rol
     RETURNING id, email, rol`,
    [name, email, hashedPassword, role]
  );

  const userId = upsert.rows[0].id;

  const sub = await conn.query(
    "SELECT id FROM suscripciones WHERE aseguradora_id = $1",
    [userId]
  );

  if (sub.rows.length === 0) {
    const plan = await conn.query("SELECT id FROM planes WHERE nombre = $1", [planName]);
    if (plan.rows.length > 0) {
      await conn.query(
        "INSERT INTO suscripciones (aseguradora_id, plan_id, estado) VALUES ($1, $2, $3)",
        [userId, plan.rows[0].id, "activa"]
      );
    }
  }

  console.log("OK:", upsert.rows[0]);
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
