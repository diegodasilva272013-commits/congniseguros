// Smoke test for Notifications endpoints (Sprint 5)
// Usage:
//   node scripts/smoke-notifications.mjs <aseguradora_id> [baseUrl]
// Env:
//   AUTH_TOKEN -> Authorization: Bearer <token>

const aseguradoraId = String(process.argv[2] || "").trim();
const baseUrl = String(process.argv[3] || process.env.BASE_URL || "http://127.0.0.1:5000").trim();

if (!aseguradoraId) {
  console.error("Usage: node scripts/smoke-notifications.mjs <aseguradora_id> [baseUrl]");
  process.exit(1);
}

const headers = { "Content-Type": "application/json" };
const token = String(process.env.AUTH_TOKEN || "").trim();
if (token) headers["Authorization"] = `Bearer ${token}`;

async function postJson(path, body) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status === "error") {
    throw new Error(`HTTP ${res.status} ${url}: ${data?.message || res.statusText}`);
  }
  return data;
}

async function getJson(path) {
  const url = `${baseUrl}${path}`;
  const res = await fetch(url, { headers });
  const data = await res.json().catch(() => null);
  if (!res.ok || data?.status === "error") {
    throw new Error(`HTTP ${res.status} ${url}: ${data?.message || res.statusText}`);
  }
  return data;
}

async function main() {
  console.log("Base URL:", baseUrl);
  console.log("aseguradora_id:", aseguradoraId);

  const templates = await getJson(`/api/notifications/templates?aseguradora_id=${encodeURIComponent(aseguradoraId)}`);
  console.log("\n=== templates ===");
  console.log("count:", Array.isArray(templates.templates) ? templates.templates.length : 0);

  const triggers = await getJson(`/api/notifications/triggers?aseguradora_id=${encodeURIComponent(aseguradoraId)}`);
  console.log("\n=== triggers ===");
  console.log("count:", Array.isArray(triggers.triggers) ? triggers.triggers.length : 0);

  const detect = await postJson(`/api/notifications/detect-enqueue`, {
    aseguradora_id: aseguradoraId,
    dry_run: true,
    max: 20,
  });

  console.log("\n=== detect (dry-run) ===");
  console.log("matched:", detect.matched);
  console.log("preview:", Array.isArray(detect.preview) ? detect.preview.length : 0);

  const enqueue = await postJson(`/api/notifications/detect-enqueue`, {
    aseguradora_id: aseguradoraId,
    dry_run: false,
    max: 10,
  });

  console.log("\n=== enqueue ===");
  console.log("enqueued:", enqueue.enqueued);

  const jobs = await getJson(`/api/notifications/jobs?aseguradora_id=${encodeURIComponent(aseguradoraId)}&status=QUEUED&limit=10`);
  console.log("\n=== jobs QUEUED ===");
  console.log("count:", Array.isArray(jobs.jobs) ? jobs.jobs.length : 0);

  const proc = await postJson(`/api/notifications/process`, {
    aseguradora_id: aseguradoraId,
    max_jobs: 5,
    dry_run: true,
  });

  console.log("\n=== process (dry-run) ===");
  console.log("processed:", Array.isArray(proc.processed) ? proc.processed.length : 0);
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:");
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
