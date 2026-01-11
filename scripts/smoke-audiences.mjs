// Smoke test for Audiences/Campaigns endpoints (Sprint 4)
// Usage:
//   node scripts/smoke-audiences.mjs <aseguradora_id> [baseUrl]
// Env:
//   AUTH_TOKEN -> Authorization: Bearer <token>

const aseguradoraId = String(process.argv[2] || "").trim();
const baseUrl = String(process.argv[3] || process.env.BASE_URL || "http://127.0.0.1:5000").trim();

if (!aseguradoraId) {
  console.error("Usage: node scripts/smoke-audiences.mjs <aseguradora_id> [baseUrl]");
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

  const defs = await getJson(`/api/audiences/definitions?aseguradora_id=${encodeURIComponent(aseguradoraId)}`);
  console.log("\n=== definitions ===");
  console.log("count:", Array.isArray(defs.definitions) ? defs.definitions.length : 0);

  const first = defs.definitions?.[0];
  if (!first?.id) {
    console.log("No definitions; skipping run.");
    return;
  }

  const run = await postJson(`/api/audiences/run`, { aseguradora_id: aseguradoraId, definition_id: first.id });
  console.log("\n=== run ===");
  console.log("total_members:", run.total_members);
  console.log("estimated_impact:", run.estimated_impact);
  console.log("persisted:", run.persisted);

  const campaigns = await getJson(`/api/campaigns?aseguradora_id=${encodeURIComponent(aseguradoraId)}`);
  console.log("\n=== campaigns ===");
  console.log("count:", Array.isArray(campaigns.campaigns) ? campaigns.campaigns.length : 0);

  const created = await postJson(`/api/campaigns`, {
    aseguradora_id: aseguradoraId,
    name: `Demo campaña ${new Date().toISOString()}`,
    line: "autos",
    channel: "whatsapp",
  });

  console.log("\n=== campaign created ===");
  console.log("id:", created.campaign?.id);
  console.log("status:", created.campaign?.status);

  if (created.campaign?.id && run.persisted?.run_uuid) {
    const launched = await postJson(`/api/campaigns/${created.campaign.id}/launch`, {
      aseguradora_id: aseguradoraId,
      audience_run_uuid: run.persisted.run_uuid,
    });
    console.log("\n=== campaign launched ===");
    console.log("run_uuid:", launched.run_uuid);
  }
}

main().catch((err) => {
  console.error("\nSMOKE FAILED:");
  console.error(err?.stack || err?.message || String(err));
  process.exit(1);
});
