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
  console.log("🔧 Agregando usuario diegodasilva272013@gmail.com...\n");

  // Verificar si existe
  const exists = await conn.query(
    "SELECT id FROM usuarios WHERE email = $1",
    ["diegodasilva272013@gmail.com"]
  );

  if (exists.rows.length > 0) {
    console.log("⚠️  Usuario ya existe. Actualizando contraseña...");
    const hashedPassword = await bcrypt.hash("Manyacapo123@", 10);
    await conn.query(
      "UPDATE usuarios SET password = $1, rol = $2 WHERE email = $3",
      [hashedPassword, "admin", "diegodasilva272013@gmail.com"]
    );
  } else {
    console.log("✅ Creando nuevo usuario...");
    const hashedPassword = await bcrypt.hash("Manyacapo123@", 10);
    await conn.query(
      "INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4)",
      ["Diego Da Silva", "diegodasilva272013@gmail.com", hashedPassword, "admin"]
    );
  }

  // Crear suscripción ENTERPRISE
  const user = await conn.query(
    "SELECT id FROM usuarios WHERE email = $1",
    ["diegodasilva272013@gmail.com"]
  );

  if (user.rows.length > 0) {
    const userId = user.rows[0].id;
    
    // Verificar si ya tiene suscripción
    const sub = await conn.query(
      "SELECT id FROM suscripciones WHERE aseguradora_id = $1",
      [userId]
    );

    if (sub.rows.length === 0) {
      // Obtener plan ENTERPRISE
      const plan = await conn.query(
        "SELECT id FROM planes WHERE nombre = $1",
        ["ENTERPRISE"]
      );

      if (plan.rows.length > 0) {
        await conn.query(
          `INSERT INTO suscripciones (aseguradora_id, plan_id, estado) 
           VALUES ($1, $2, $3)`,
          [userId, plan.rows[0].id, "activa"]
        );
        console.log("✅ Suscripción ENTERPRISE asignada");
      }
    }
  }

  console.log("\n✅ Usuario listo!\n");
  console.log("📧 Email:    diegodasilva272013@gmail.com");
  console.log("🔑 Password: Manyacapo123@");
  console.log("👤 Rol:      admin\n");

} catch (err) {
  console.error("❌ Error:", err.message);
} finally {
  await conn.end();
  await pool.end();
  process.exit(0);
}
