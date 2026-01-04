import pkg from "pg";
import bcrypt from "bcrypt";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: "cogniseguros",
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

const conn = await pool.connect();

try {
  console.log("🔧 Restaurando contraseña original...\n");

  const hashedPassword = await bcrypt.hash("1234563", 10);
  await conn.query(
    "UPDATE usuarios SET password = $1 WHERE email = $2",
    [hashedPassword, "diegodasilva272013@gmail.com"]
  );

  console.log("✅ Contraseña restaurada!\n");
  console.log("📧 Email:    diegodasilva272013@gmail.com");
  console.log("🔑 Password: 1234563\n");

} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await conn.end();
  await pool.end();
  process.exit(0);
}
