import { spawn, spawnSync } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

function isPortFree(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', () => resolve(false));
    srv.listen({ port, host }, () => {
      srv.close(() => resolve(true));
    });
  });
}

async function findFreePort(startPort, host = '127.0.0.1', maxTries = 50) {
  for (let i = 0; i < maxTries; i++) {
    const p = startPort + i;
    // eslint-disable-next-line no-await-in-loop
    if (await isPortFree(p, host)) return p;
  }
  return null;
}

function ensurePortsFreeOnWindows(ports) {
  if (process.platform !== 'win32') return;

  for (const port of ports) {
    const ps = `
$conns = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue;
if (-not $conns) { exit 0 }

$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique;
foreach ($p in $pids) {
  try { $proc = Get-Process -Id $p -ErrorAction Stop } catch { continue }
  $name = $proc.ProcessName
  if ($name -ne 'node' -and $name -ne 'nodejs') {
    Write-Host "[dev-both] Port ${port} is in use by process: $name (PID $p). Will pick another free port." -ForegroundColor Yellow
    continue
  }
  Write-Host "[dev-both] Port ${port} is in use by node (PID $p). Stopping..." -ForegroundColor Yellow
  try { Stop-Process -Id $p -Force -ErrorAction Stop } catch { }
}
exit 0
`;

    const r = spawnSync('powershell', ['-NoProfile', '-Command', ps], {
      stdio: 'inherit',
      shell: false,
    });

    // Nunca cortamos el start por puertos ocupados por otros procesos.
    // (Solo intentamos liberar si es node.exe; si no, se elige otro puerto libre.)
  }
}

const cwd = process.cwd();
const viteBin = path.resolve(cwd, 'node_modules', 'vite', 'bin', 'vite.js');

async function main() {
  // Windows: evita el quilombo típico de puertos colgados de node.exe
  // (si el puerto lo ocupa node, lo mata; si lo ocupa otro proceso, no rompe: usa otro puerto libre)
  ensurePortsFreeOnWindows([5000, 3000]);

  const host = '127.0.0.1';
  const backendPort = (await findFreePort(Number(process.env.BACKEND_PORT) || 5000, host)) ?? 5000;
  const vitePort = (await findFreePort(Number(process.env.VITE_PORT) || 3000, host)) ?? 3000;

  console.log(`[dev-both] Backend port: ${backendPort}`);
  console.log(`[dev-both] Vite port: ${vitePort}`);
  console.log(`[dev-both] Open: http://${host}:${vitePort}`);
  if (backendPort !== 5000) {
    console.log(`[dev-both] Note: 5000 was busy, using ${backendPort} for backend.`);
  }
  if (vitePort !== 3000) {
    console.log(`[dev-both] Note: 3000 was busy, using ${vitePort} for Vite.`);
  }

  const server = spawn('node', ['--watch', 'server.js'], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
      PORT: String(backendPort),
    },
  });

  server.on('error', (err) => {
    console.error(`[dev-both] server failed to start:`, err?.message || err);
  });

  const vite = spawn('node', [viteBin], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
      BACKEND_PORT: String(backendPort),
      VITE_PORT: String(vitePort),
    },
  });

  vite.on('error', (err) => {
    console.error(`[dev-both] vite failed to start:`, err?.message || err);
  });

  let shuttingDown = false;

  function shutdown(exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;

    try {
      server.kill('SIGTERM');
    } catch {
      // ignore
    }
    try {
      vite.kill('SIGTERM');
    } catch {
      // ignore
    }

    setTimeout(() => process.exit(exitCode), 250);
  }

  process.on('SIGINT', () => shutdown(0));
  process.on('SIGTERM', () => shutdown(0));

  server.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`[dev-both] server exited (${code ?? 0}), stopping vite...`);
      shutdown(code ?? 0);
    }
  });

  vite.on('exit', (code) => {
    if (!shuttingDown) {
      console.log(`[dev-both] vite exited (${code ?? 0}), stopping server...`);
      shutdown(code ?? 0);
    }
  });
}

main().catch((err) => {
  console.error('[dev-both] Fatal error:', err);
  process.exit(1);
});
