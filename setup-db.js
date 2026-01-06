import pkg from "pg";
import dotenv from "dotenv";
import bcrypt from "bcrypt";

dotenv.config();

const { Pool } = pkg;

function parsePostgresUrl(rawUrl) {
  if (!rawUrl) return null;
  const url = new URL(rawUrl);
  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error(`Unsupported DATABASE_URL protocol: ${url.protocol}`);
  }

  const databaseFromPath = url.pathname?.replace(/^\//, "");
  const port = url.port ? Number(url.port) : 5432;
  const sslMode = url.searchParams.get("sslmode");

  return {
    user: decodeURIComponent(url.username || ""),
    password: decodeURIComponent(url.password || ""),
    host: url.hostname,
    port,
    database: databaseFromPath || undefined,
    ssl:
      sslMode === "require" || sslMode === "verify-full" || sslMode === "verify-ca"
        ? { rejectUnauthorized: false }
        : undefined,
  };
}

function getDbUrlFromEnv() {
  return (
    process.env.DB_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRESQL_URL ||
    process.env.PGURL ||
    ""
  ).trim();
}

function getPgConfig({ databaseOverride } = {}) {
  const dbUrl = getDbUrlFromEnv();
  if (dbUrl) {
    const parsed = parsePostgresUrl(dbUrl);
    return {
      user: parsed.user,
      host: parsed.host,
      database: databaseOverride || parsed.database,
      password: parsed.password,
      port: parsed.port,
      ssl: parsed.ssl,
    };
  }

  return {
    user: process.env.DB_USER || process.env.PGUSER || "postgres",
    host: process.env.DB_HOST || process.env.PGHOST || "localhost",
    database: databaseOverride || process.env.DB_NAME || process.env.PGDATABASE,
    password: process.env.DB_PASSWORD || process.env.PGPASSWORD || "postgres",
    port: Number(process.env.DB_PORT || process.env.PGPORT || 5432),
  };
}

// Por defecto NO destruimos datos (preserva IDs de usuarios y tenants).
// Para reiniciar desde cero: setear RESET_DB=1 antes de ejecutar.
const RESET_DB = String(process.env.RESET_DB || "").trim() === "1";

// Conexión a PostgreSQL
const dbName = (process.env.DB_NAME || "cogniseguros").trim();
const adminDbName = (process.env.DB_ADMIN_DB || "postgres").trim();

const pool = new Pool(getPgConfig({ databaseOverride: adminDbName }));

const client = await pool.connect();

try {
  console.log("🔧 Iniciando setup de BD...\n");

  const cfg = getPgConfig({ databaseOverride: adminDbName });
  console.log(`ℹ️  Conectando a ${cfg.host}:${cfg.port}/${adminDbName}`);

  // 1. Crear BD
  console.log("1️⃣  Creando BD 'cogniseguros'...");
  const exists = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);

  if (exists.rows.length > 0) {
    if (!RESET_DB) {
      console.log("ℹ️  BD ya existe. (RESET_DB=1 para recrearla desde cero)\n");
    } else {
    // Si hay conexiones abiertas, DROP DATABASE puede fallar. Las terminamos primero.
    await client.query(
      "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()",
      [dbName]
    );

    // Intento con FORCE (Postgres 13+). Si no existe en tu versión, cae al DROP normal.
    try {
      await client.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE);`);
    } catch {
      await client.query(`DROP DATABASE IF EXISTS ${dbName};`);
    }
    }
  }

  if (exists.rows.length === 0 || RESET_DB) {
    try {
      await client.query(`CREATE DATABASE ${dbName};`);
    } catch (err) {
      // Puede pasar por carreras o si el DROP falló por permisos/locks.
      // 42P04 = duplicate_database, 23505 = unique_violation (pg_database_datname_index)
      if (err.code !== "42P04" && err.code !== "23505") throw err;
    }
    console.log("✅ BD creada\n");
  }

  // Cerrar conexión a la DB 'postgres'
  client.release();
  await pool.end();

  // Conectar a la nueva BD
  const pool2 = new Pool(getPgConfig({ databaseOverride: dbName }));

  const conn = await pool2.connect();

  // 2. Crear tablas base
  console.log("2️⃣  Creando tablas base...");
  
  await conn.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(255) NOT NULL,
      email VARCHAR(255) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      rol VARCHAR(50) DEFAULT 'user',
      pais VARCHAR(2) DEFAULT 'AR',
      paises TEXT DEFAULT 'AR',
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: usuarios");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id),
      nombre VARCHAR(255) NOT NULL,
      apellido VARCHAR(255),
      email VARCHAR(255),
      telefono VARCHAR(20),
      cedula VARCHAR(20),
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: clientes");

  // 3. Crear tablas de membresía
  console.log("\n3️⃣  Creando tablas de membresía...");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS planes (
      id SERIAL PRIMARY KEY,
      nombre VARCHAR(100) NOT NULL,
      descripcion TEXT,
      precio_mensual DECIMAL(10, 2),
      clientes INT DEFAULT 10,
      usuarios INT DEFAULT 3,
      soporta_whatsapp BOOLEAN DEFAULT false,
      soporta_openai BOOLEAN DEFAULT false,
      soporta_api_rest BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  // Permite hacer inserts idempotentes con ON CONFLICT (nombre)
  await conn.query(`CREATE UNIQUE INDEX IF NOT EXISTS planes_nombre_unique ON planes (nombre);`);
  console.log("  ✓ tabla: planes");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS suscripciones (
      id SERIAL PRIMARY KEY,
      aseguradora_id INT REFERENCES usuarios(id),
      plan_id INT REFERENCES planes(id),
      estado VARCHAR(50) DEFAULT 'activa',
      fecha_inicio TIMESTAMP DEFAULT NOW(),
      fecha_fin TIMESTAMP,
      fecha_cancelacion TIMESTAMP,
      auto_renovacion BOOLEAN DEFAULT true,
      stripe_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: suscripciones");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS invitaciones (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(20) UNIQUE NOT NULL,
      plan_id INT REFERENCES planes(id),
      email VARCHAR(255),
      usado BOOLEAN DEFAULT false,
      expira_en TIMESTAMP,
      pais VARCHAR(2) DEFAULT 'AR',
      paises TEXT DEFAULT 'AR',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: invitaciones");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS auditoria (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id),
      accion VARCHAR(100),
      recurso VARCHAR(100),
      detalles JSONB,
      timestamp TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: auditoria");

  // 4. Crear tablas 2FA
  console.log("\n4️⃣  Creando tablas 2FA...");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS dos_factores (
      id SERIAL PRIMARY KEY,
      usuario_id INT UNIQUE REFERENCES usuarios(id),
      tipo VARCHAR(20),
      codigo_actual VARCHAR(10),
      intentos_fallidos INT DEFAULT 0,
      bloqueado_hasta TIMESTAMP,
      habilitado BOOLEAN DEFAULT false,
      contacto VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: dos_factores");

  await conn.query(`
    CREATE TABLE IF NOT EXISTS backup_codes (
      id SERIAL PRIMARY KEY,
      usuario_id INT REFERENCES usuarios(id),
      codigo VARCHAR(20),
      usado BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log("  ✓ tabla: backup_codes");

  // 5. Insertar planes
  console.log("\n5️⃣  Insertando planes...");

  const planes = [
    {
      nombre: "FREE",
      descripcion: "Plan gratuito - Prueba SegurosPro",
      precio: 0,
      clientes: 5,
      usuarios: 1,
      whatsapp: false,
      openai: false,
      api: false,
    },
    {
      nombre: "STARTER",
      descripcion: "Plan básico - Ideal para pequeñas aseguradoras",
      precio: 29.99,
      clientes: 50,
      usuarios: 3,
      whatsapp: true,
      openai: false,
      api: false,
    },
    {
      nombre: "PROFESSIONAL",
      descripcion: "Plan profesional - Todas las características",
      precio: 99.99,
      clientes: 500,
      usuarios: 10,
      whatsapp: true,
      openai: true,
      api: false,
    },
    {
      nombre: "ENTERPRISE",
      descripcion: "Plan empresarial - Soporte prioritario",
      precio: 299.99,
      clientes: 5000,
      usuarios: 50,
      whatsapp: true,
      openai: true,
      api: true,
    },
  ];

  for (const plan of planes) {
    const inserted = await conn.query(
      `INSERT INTO planes (nombre, descripcion, precio_mensual, clientes, usuarios, soporta_whatsapp, soporta_openai, soporta_api_rest)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [plan.nombre, plan.descripcion, plan.precio, plan.clientes, plan.usuarios, plan.whatsapp, plan.openai, plan.api]
    );
    if (inserted.rowCount > 0) console.log(`  ✓ Plan: ${plan.nombre}`);
  }

  // 6. Crear usuario de test
  console.log("\n6️⃣  Creando usuarios de test...");

  const passwordTest = await bcrypt.hash("123456", 10);
  const passwordAdmin = await bcrypt.hash("admin123", 10);

  const userTest = await conn.query(
    `INSERT INTO usuarios (nombre, email, password, rol)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    ["Usuario Test", "test@test.com", passwordTest, "user"]
  );
  if (userTest.rows[0]) console.log(`  ✓ Usuario: test@test.com (contraseña: 123456)`);

  const userAdmin = await conn.query(
    `INSERT INTO usuarios (nombre, email, password, rol)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, email`,
    ["Admin", "admin@test.com", passwordAdmin, "admin"]
  );
  if (userAdmin.rows[0]) console.log(`  ✓ Usuario: admin@test.com (contraseña: admin123)`);

  // 7. Crear suscripciones de test
  console.log("\n7️⃣  Creando suscripciones de test...");

  const fechaFin = new Date();
  fechaFin.setMonth(fechaFin.getMonth() + 1);

  // Crear suscripciones solo si se insertaron usuarios de test en esta corrida.
  if (userTest.rows[0]) {
    await conn.query(
      `INSERT INTO suscripciones (aseguradora_id, plan_id, estado, fecha_fin)
       VALUES ($1, $2, $3, $4)`,
      [userTest.rows[0].id, 2, "ACTIVA", fechaFin]
    );
    console.log("  ✓ Suscripción STARTER para usuario test");
  }

  if (userAdmin.rows[0]) {
    await conn.query(
      `INSERT INTO suscripciones (aseguradora_id, plan_id, estado, fecha_fin)
       VALUES ($1, $2, $3, $4)`,
      [userAdmin.rows[0].id, 4, "ACTIVA", fechaFin]
    );
    console.log("  ✓ Suscripción ENTERPRISE para admin");
  }

  console.log("\n✅ ¡Setup completado exitosamente!\n");
  console.log("📝 Credenciales de prueba:");
  console.log("  - test@test.com / 123456 (Usuario regular)");
  console.log("  - admin@test.com / admin123 (Admin - ver Dashboard)\n");

  // Cerrar conexión a la DB 'cogniseguros'
  conn.release();
  await pool2.end();
} catch (error) {
  console.error("❌ Error:", error.message);
  process.exit(1);
}
