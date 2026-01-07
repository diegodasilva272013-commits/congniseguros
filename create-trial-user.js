import pkg from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const email = String(process.argv[2] || "").trim().toLowerCase();
const password = String(process.argv[3] || "");
const name = String(process.argv[4] || "").trim() || "Aseguradora";
const daysRaw = Number(process.argv[5] ?? 2);
const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(30, Math.floor(daysRaw)) : 2;

if (!email || !email.includes("@") || !password) {
  console.error("Usage: node create-trial-user.js <email> <password> [name] [days=2]");
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
  await conn.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ");
  await conn.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ");
  await conn.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ");
  await conn.query("ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS blocked_reason TEXT");

  const hashed = await bcrypt.hash(password, 12);
  const trialStartedAt = new Date();
  const trialExpiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

  const upsert = await conn.query(
    `INSERT INTO usuarios (nombre, email, password, rol, trial_started_at, trial_expires_at, blocked_at, blocked_reason)
     VALUES ($1, $2, $3, 'aseguradora', $4, $5, NULL, NULL)
     ON CONFLICT (email) DO UPDATE SET
       nombre = EXCLUDED.nombre,
       password = EXCLUDED.password,
       rol = EXCLUDED.rol,
       trial_started_at = EXCLUDED.trial_started_at,
       trial_expires_at = EXCLUDED.trial_expires_at,
       blocked_at = NULL,
       blocked_reason = NULL
     RETURNING id, email, rol, trial_started_at, trial_expires_at, blocked_at, blocked_reason`,
    [name, email, hashed, trialStartedAt, trialExpiresAt]
  );

  const userId = upsert.rows[0].id;

  const plan = await conn.query("SELECT id FROM planes WHERE UPPER(nombre) = 'FREE' LIMIT 1");
  const planId = plan.rows?.[0]?.id || null;
  if (planId) {
    await conn.query(
      `INSERT INTO suscripciones (aseguradora_id, plan_id, estado, fecha_inicio, fecha_fin, fecha_proximo_pago)
       VALUES ($1, $2, 'ACTIVA', $3, $4, $4)
       ON CONFLICT (aseguradora_id) DO UPDATE SET
         plan_id = EXCLUDED.plan_id,
         estado = EXCLUDED.estado,
         fecha_inicio = EXCLUDED.fecha_inicio,
         fecha_fin = EXCLUDED.fecha_fin,
         fecha_proximo_pago = EXCLUDED.fecha_proximo_pago`,
      [userId, planId, trialStartedAt, trialExpiresAt]
    );
  }

  console.log("OK:", upsert.rows[0], { trial_days: days });
} catch (err) {
  console.error("Error:", err.message);
  process.exitCode = 1;
} finally {
  conn.release();
  await pool.end();
}
