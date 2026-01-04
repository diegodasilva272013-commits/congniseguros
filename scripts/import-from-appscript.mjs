import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pkg from 'pg';

const { Pool } = pkg;

function findApiUrlFromApp() {
  const candidates = [
    path.resolve(process.cwd(), 'src', 'App.jsx'),
    path.resolve(process.cwd(), 'Congniseguros.js'),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, 'utf8');
    const m = content.match(/const\s+API_URL\s*=\s*(?:\n\s*)?"(https:\/\/script\.google\.com\/macros\/s\/[^"]+\/exec)"/);
    if (m?.[1]) return m[1];
  }
  return null;
}

async function fetchFromAppsScript(apiUrl) {
  const payload = { action: 'getClients', aseguradora_id: 'ALL' };
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Apps Script no devolvió JSON. HTTP ${res.status}. Body: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(`Apps Script HTTP ${res.status}: ${data?.message || text.slice(0, 200)}`);
  }

  if (data?.status === 'error') {
    throw new Error(data.message || 'Apps Script status=error');
  }

  const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
  return list;
}

function normalizeString(v) {
  return String(v ?? '').trim();
}

async function main() {
  const apiUrl = findApiUrlFromApp();
  if (!apiUrl) {
    throw new Error('No pude encontrar API_URL (Google Apps Script) en src/App.jsx (o en Congniseguros.js legacy)');
  }

  const email = process.argv[2] || process.env.IMPORT_USER_EMAIL || 'diegodasilva272013@gmail.com';

  const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'cogniseguros',
    password: process.env.DB_PASSWORD || 'postgres',
    port: Number(process.env.DB_PORT || 5432),
  });

  try {
    const u = await pool.query('SELECT id, email FROM usuarios WHERE LOWER(email)=LOWER($1) LIMIT 1', [email]);
    if (u.rows.length === 0) {
      throw new Error(`No existe el usuario en la BD local: ${email}`);
    }
    const userId = u.rows[0].id;

    console.log('Apps Script URL:', apiUrl);
    console.log('Importando para usuario:', email, 'id=', userId);

    const clients = await fetchFromAppsScript(apiUrl);
    console.log('Clientes recibidos desde Apps Script:', clients.length);

    if (clients.length === 0) {
      console.log('No hay clientes para importar.');
      return;
    }

    // Índice para evitar duplicados: por usuario_id + cedula
    await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_usuario_cedula ON clientes(usuario_id, cedula)`);

    let inserted = 0;
    let updated = 0;
    let skipped = 0;

    for (const raw of clients) {
      const nombre = normalizeString(raw.nombre);
      const apellido = normalizeString(raw.apellido);
      const emailCliente = normalizeString(raw.mail || raw.email);
      const telefono = normalizeString(raw.telefono);
      const cedula = normalizeString(raw.documento || raw.cedula);

      if (!nombre || !cedula) {
        skipped += 1;
        continue;
      }

      // Upsert básico (mantiene datos locales si ya existen y el nuevo viene vacío)
      const r = await pool.query(
        `INSERT INTO clientes (usuario_id, nombre, apellido, email, telefono, cedula)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (usuario_id, cedula)
         DO UPDATE SET
           nombre = EXCLUDED.nombre,
           apellido = CASE WHEN EXCLUDED.apellido <> '' THEN EXCLUDED.apellido ELSE clientes.apellido END,
           email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE clientes.email END,
           telefono = CASE WHEN EXCLUDED.telefono <> '' THEN EXCLUDED.telefono ELSE clientes.telefono END
         RETURNING (xmax = 0) AS inserted`,
        [Number(userId), nombre, apellido, emailCliente, telefono, cedula]
      );

      if (r.rows[0]?.inserted) inserted += 1;
      else updated += 1;
    }

    console.log('Import terminado. Insertados:', inserted, 'Actualizados:', updated, 'Saltados:', skipped);

    const c = await pool.query('SELECT COUNT(*)::int AS c FROM clientes WHERE usuario_id = $1', [Number(userId)]);
    console.log('Total clientes para usuario_id', userId, ':', c.rows[0].c);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('ERROR:', e.message);
  process.exit(1);
});
