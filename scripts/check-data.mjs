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

async function main() {
  const { rows: usuariosCount } = await pool.query('SELECT COUNT(*)::int AS c FROM usuarios');
  const { rows: clientesCount } = await pool.query('SELECT COUNT(*)::int AS c FROM clientes');
  console.log('usuarios:', usuariosCount[0].c);
  console.log('clientes:', clientesCount[0].c);

  const { rows: usuarios } = await pool.query(
    `SELECT id, email, nombre, rol
     FROM usuarios
     ORDER BY id ASC
     LIMIT 20`
  );
  console.log('\n=== usuarios sample ===');
  console.table(usuarios);

  const { rows: byUsuario } = await pool.query(
    `SELECT usuario_id, COUNT(*)::int AS c
     FROM clientes
     GROUP BY usuario_id
     ORDER BY c DESC NULLS LAST, usuario_id NULLS FIRST`
  );
  console.log('\n=== clientes por usuario_id ===');
  console.table(byUsuario);

  const { rows: clientes } = await pool.query(
    `SELECT id, usuario_id, nombre, apellido, email, telefono, cedula, created_at
     FROM clientes
     ORDER BY created_at DESC NULLS LAST, id DESC
     LIMIT 20`
  );
  console.log('\n=== clientes sample ===');
  console.table(clientes);
}

try {
  await main();
} catch (err) {
  console.error('ERROR:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
