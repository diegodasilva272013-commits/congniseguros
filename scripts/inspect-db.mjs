import 'dotenv/config';
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'cogniseguros',
  password: process.env.DB_PASSWORD || 'postgres',
  port: Number(process.env.DB_PORT || 5432),
});

async function showColumns(table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1
     ORDER BY ordinal_position`,
    [table]
  );
  console.log(`\n=== ${table} columns ===`);
  console.table(rows);
}

try {
  await showColumns('usuarios');
  await showColumns('clientes');
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
