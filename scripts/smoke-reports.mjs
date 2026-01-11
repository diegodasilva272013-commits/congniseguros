// Smoke test for Reports v1 endpoints
// Usage:
//   node scripts/smoke-reports.mjs <aseguradora_id> [baseUrl]
// Env:
//   AUTOMATION_API_KEY (optional) -> sent as x-automation-key
//   AUTH_TOKEN (optional) -> sent as Authorization: Bearer <token>

const aseguradoraId = String(process.argv[2] || "").trim();
const baseUrl = String(process.argv[3] || process.env.BASE_URL || "http://127.0.0.1:5000").trim();

if (!aseguradoraId) {
  console.error("Usage: node scripts/smoke-reports.mjs <aseguradora_id> [baseUrl]");
  process.exit(1);
}

const headers = { "Content-Type": "application/json" };
const key = String(process.env.AUTOMATION_API_KEY || "").trim();
if (key) headers["x-automation-key"] = key;
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

function isoDaysAgo(n) {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

async function main() {
  console.log("Base URL:", baseUrl);
  console.log("aseguradora_id:", aseguradoraId);
  console.log("Auth:", {
    hasAutomationKey: !!key,
    hasAuthToken: !!token,
  });

  const from = isoDaysAgo(365);
  const to = new Date().toISOString();

  const monthly = await postJson("/api/reports/financial/monthly", { aseguradora_id: aseguradoraId, from, to });
  console.log("\n=== financial/monthly ===");
  console.log("contract_version:", monthly.contract_version);
  console.log("rows:", Array.isArray(monthly.rows) ? monthly.rows.length : 0);

  const lineStatus = await postJson("/api/reports/portfolio/line-status", { aseguradora_id: aseguradoraId, from, to });
  console.log("\n=== portfolio/line-status ===");
  console.log("contract_version:", lineStatus.contract_version);
  console.log("rows:", Array.isArray(lineStatus.rows) ? lineStatus.rows.length : 0);

  const expirations = await postJson("/api/reports/portfolio/expirations", { aseguradora_id: aseguradoraId, days: 30 });
  console.log("\n=== portfolio/expirations ===");
  console.log("contract_version:", expirations.contract_version);
  console.log("days:", expirations.days);
  console.log("rows:", Array.isArray(expirations.rows) ? expirations.rows.length : 0);
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:");
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
