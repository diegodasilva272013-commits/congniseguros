import { spawn } from "node:child_process";

function runNodeScript(scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) return resolve({ code: 1, signal });
      resolve({ code: code ?? 0, signal: null });
    });
  });
}

async function main() {
  const runDbSetup = String(process.env.RUN_DB_SETUP || "").trim() === "1";
  const runMigrations = String(process.env.RUN_MIGRATIONS || "").trim() === "1";

  if (runDbSetup) {
    console.log("[start-runtime] RUN_DB_SETUP=1 -> running setup-db.js (idempotent)");
    const r = await runNodeScript("setup-db.js");
    if (r.code !== 0) {
      console.error("[start-runtime] setup-db.js failed, exiting");
      process.exit(r.code);
    }
  }

  if (runMigrations) {
    console.log("[start-runtime] RUN_MIGRATIONS=1 -> running migrate.js");
    const r = await runNodeScript("migrate.js");
    if (r.code !== 0) {
      console.error("[start-runtime] migrate.js failed, exiting");
      process.exit(r.code);
    }
  }

  console.log("[start-runtime] starting server.js");
  const server = spawn(process.execPath, ["server.js"], {
    stdio: "inherit",
    env: process.env,
  });

  const shutdown = (signal) => {
    try {
      server.kill(signal);
    } catch {
      // ignore
    }
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  server.on("exit", (code, signal) => {
    if (signal) process.exit(1);
    process.exit(code ?? 0);
  });
}

main().catch((err) => {
  console.error("[start-runtime] fatal:", err?.message || err);
  process.exit(1);
});
