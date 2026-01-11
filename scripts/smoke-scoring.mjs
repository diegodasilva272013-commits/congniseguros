// Smoke test for Scoring endpoints
// Usage:
//   node scripts/smoke-scoring.mjs <aseguradora_id> <cliente_id> [baseUrl]
// Env:
//   AUTH_TOKEN (recommended) -> Authorization: Bearer <token>
//   AUTOMATION_API_KEY (optional) -> x-automation-key (no requerido para scoring)

const aseguradoraId = String(process.argv[2] || "").trim();
const clienteId = String(process.argv[3] || "").trim();
const baseUrl = String(process.argv[4] || process.env.BASE_URL || "http://127.0.0.1:5000").trim();

if (!aseguradoraId || !clienteId) {
  console.error("Usage: node scripts/smoke-scoring.mjs <aseguradora_id> <cliente_id> [baseUrl]");
  process.exit(1);
}

const headers = { "Content-Type": "application/json" };
const token = String(process.env.AUTH_TOKEN || "").trim();
if (token) headers["Authorization"] = `Bearer ${token}`;

const key = String(process.env.AUTOMATION_API_KEY || "").trim();
if (key) headers["x-automation-key"] = key;

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
  console.log("cliente_id:", clienteId);
  console.log("Auth:", { hasAuthToken: !!token });

  const scored = await postJson("/api/scoring/score", {
    aseguradora_id: aseguradoraId,
    cliente_id: clienteId,
    persist: true,
  });

  console.log("\n=== score ===");
  console.log("score:", scored.score);
  console.log("band:", scored.band);
  console.log("persisted:", scored.persisted);
  console.log("rules_matched:", Array.isArray(scored.explain) ? scored.explain.filter((x) => x.matched).length : 0);

  const runs = await getJson(`/api/scoring/runs?aseguradora_id=${encodeURIComponent(aseguradoraId)}&cliente_id=${encodeURIComponent(clienteId)}&limit=5`);
  console.log("\n=== runs (last 5) ===");
  console.log("count:", Array.isArray(runs.runs) ? runs.runs.length : 0);
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:");
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
