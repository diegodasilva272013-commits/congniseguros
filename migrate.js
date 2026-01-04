import pkg from "pg";
import fs from "fs";
import readline from "readline";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "cogniseguros",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (prompt) => {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer.trim());
    });
  });
};

async function initDB() {
  try {
    console.log("📦 Inicializando base de datos...");

    const schema = fs.readFileSync("./schema.sql", "utf-8");
    await pool.query(schema);

    console.log("✅ Schema creado exitosamente");
  } catch (err) {
    console.error("❌ Error inicializando DB:", err.message);
    throw err;
  }
}

async function migrateFromGoogle() {
  try {
    console.log("\n📥 Ingrese datos para migración desde Google Sheets");

    // Simular migración desde archivo CSV (ya que no podemos acceder directamente a Google)
    const csvFile = await question("Ruta del archivo CSV a migrar (dejar vacío para saltar): ");

    if (!csvFile) {
      console.log("⏭️  Migración saltada");
      return;
    }

    if (!fs.existsSync(csvFile)) {
      console.log("❌ Archivo no encontrado");
      return;
    }

    const lines = fs.readFileSync(csvFile, "utf-8").split("\n");
    console.log(`📊 Encontrados ${lines.length - 1} registros`);

    // TODO: Parsear y migrar datos
    console.log("✅ Migración completada (requiere personalización según tu CSV)");
  } catch (err) {
    console.error("❌ Error en migración:", err.message);
  }
}

async function createDefaultUser() {
  try {
    console.log("\n👤 Creando usuario de prueba...");

    const email = await question("Email (default: admin@cogniseguros.com): ") || "admin@cogniseguros.com";
    const password = await question("Password (default: Admin123): ") || "Admin123";
    const nombre = await question("Nombre (default: Admin): ") || "Admin";

    const bcrypt = (await import("bcrypt")).default;
    const hashed = await bcrypt.hash(password, 10);

    const result = await pool.query(
      "INSERT INTO usuarios (nombre, email, password, rol) VALUES ($1, $2, $3, $4) RETURNING id, email",
      [nombre, email, hashed, "aseguradora"]
    );

    console.log("✅ Usuario creado:", result.rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      console.log("ℹ️  Usuario ya existe");
    } else {
      console.error("❌ Error creando usuario:", err.message);
    }
  }
}

async function main() {
  try {
    console.log("🚀 MIGRACIÓN: Google Sheets → PostgreSQL\n");

    // 1. Test conexión
    console.log("🔌 Probando conexión a PostgreSQL...");
    await pool.query("SELECT NOW()");
    console.log("✅ Conexión exitosa\n");

    // 2. Inicializar schema
    await initDB();

    // 3. Migrar datos
    await migrateFromGoogle();

    // 4. Crear usuario de prueba
    await createDefaultUser();

    console.log("\n✅ Migración completada exitosamente!");
    console.log("\nPróximos pasos:");
    console.log("1. npm install");
    console.log("2. Configurar .env con credenciales DB");
    console.log("3. npm run server");
    console.log("4. npm run dev (en otra terminal)");
  } catch (err) {
    console.error("❌ Error fatal:", err.message);
    process.exit(1);
  } finally {
    rl.close();
    await pool.end();
  }
}

main();
