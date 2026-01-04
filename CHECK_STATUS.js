import dotenv from "dotenv";
import pkg from "pg";

dotenv.config();

const { Pool } = pkg;

console.log("\n" + "=".repeat(60));
console.log("🔍 VERIFICACIÓN DE CONFIGURACIÓN - COGNISEGUROS");
console.log("=".repeat(60) + "\n");

// 1. Verificar .env
console.log("📋 ARCHIVO .ENV:");
const requiredEnvVars = [
  "DB_USER",
  "DB_HOST",
  "DB_NAME",
  "DB_PASSWORD",
  "DB_PORT",
  "PORT",
];

let envOk = true;
requiredEnvVars.forEach((varName) => {
  const value = process.env[varName];
  const status = value ? "✅" : "❌";
  console.log(`  ${status} ${varName}: ${value ? "configurado" : "FALTA"}`);
  if (!value) envOk = false;
});

// 2. Verificar conexión PostgreSQL
console.log("\n🗄️  CONEXIÓN A POSTGRESQL:");

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "cogniseguros",
  password: process.env.DB_PASSWORD || "postgres",
  port: process.env.DB_PORT || 5432,
});

try {
  const client = await pool.connect();
  console.log(`  ✅ Conectado a: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
  console.log(`  ✅ Base de datos: ${process.env.DB_NAME}`);
  console.log(`  ✅ Usuario: ${process.env.DB_USER}`);

  // Verificar tablas
  console.log("\n📊 TABLAS EN LA BASE DE DATOS:");
  const result = await client.query(`
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name;
  `);

  if (result.rows.length === 0) {
    console.log("  ⚠️  No hay tablas. Ejecuta: npm run setup-db");
  } else {
    result.rows.forEach((row) => {
      console.log(`  ✅ ${row.table_name}`);
    });
  }

  client.release();
} catch (err) {
  console.log(`  ❌ Error de conexión: ${err.message}`);
  console.log("  💡 Solución: Verifica que PostgreSQL esté corriendo");
}

// 3. Verificar archivos necesarios
console.log("\n📁 ARCHIVOS DEL PROYECTO:");
const fs = await import("fs");
const files = [
  "package.json",
  "server.js",
  "schema.sql",
  ".env",
  "setup-db.js",
  "migrate.js",
];

files.forEach((file) => {
  const exists = fs.existsSync(`c:\\Users\\diego\\OneDrive\\Desktop\\App Cogniseguros\\${file}`);
  const status = exists ? "✅" : "❌";
  console.log(`  ${status} ${file}`);
});

// 4. Resumen
console.log("\n" + "=".repeat(60));
console.log("📝 RESUMEN DE ESTADO:");
console.log("=".repeat(60));

console.log(`
✅ PARA EJECUTAR LA APP:
1. npm install (si no está hecho)
2. npm run setup-db (para crear tablas)
3. npm run dev-both (para abrir front + back)

🌐 ACCESO:
- Frontend: http://localhost:5173
- Backend: http://localhost:5000

💾 BASE DE DATOS:
- Host: ${process.env.DB_HOST}
- Puerto: ${process.env.DB_PORT}
- Base: ${process.env.DB_NAME}
- Usuario: ${process.env.DB_USER}
`);

console.log("=".repeat(60) + "\n");

process.exit(0);
