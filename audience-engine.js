import crypto from "node:crypto";

const safeTrim = (v) => String(v ?? "").trim();

const safeJson = (v, fallback) => {
  if (v && typeof v === "object") return v;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {
      // ignore
    }
  }
  return fallback;
};

const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const normalizeDateOnly = (raw) => {
  const s = safeTrim(raw);
  if (!s) return null;
  const first10 = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first10)) return null;
  return first10;
};

const sha256 = (text) => crypto.createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");

export async function ensureTenantAudiencesSchema(tenantPool) {
  await tenantPool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => {});

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS audience_definitions (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL,
      version INT NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      filter JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(key, version)
    );
  `);

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS audience_runs (
      id BIGSERIAL PRIMARY KEY,
      run_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
      definition_id BIGINT REFERENCES audience_definitions(id) ON DELETE SET NULL,
      definition_key TEXT,
      definition_version INT,
      as_of_date DATE,
      filter_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      total_members INT NOT NULL DEFAULT 0,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      computed_ms INT,
      computed_by_mode TEXT,
      computed_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_audience_runs_run_uuid ON audience_runs(run_uuid)");
  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_audience_runs_created_at ON audience_runs(created_at DESC)");
  await tenantPool.query(
    "CREATE INDEX IF NOT EXISTS ix_audience_runs_definition_created_at ON audience_runs(definition_id, created_at DESC)"
  );

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS audience_run_members (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES audience_runs(id) ON DELETE CASCADE,
      cliente_id INT NOT NULL,
      features JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_audience_run_members_run_id ON audience_run_members(run_id)");
  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_audience_run_members_cliente_id ON audience_run_members(cliente_id)");

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id BIGSERIAL PRIMARY KEY,
      key TEXT,
      name TEXT NOT NULL,
      line TEXT NOT NULL DEFAULT 'autos',
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      status TEXT NOT NULL DEFAULT 'DRAFT',
      budget NUMERIC,
      expected_value NUMERIC,
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_campaigns_status_created_at ON campaigns(status, created_at DESC)");

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS campaign_runs (
      id BIGSERIAL PRIMARY KEY,
      run_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
      campaign_id BIGINT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      audience_run_id BIGINT REFERENCES audience_runs(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'CREATED',
      started_at TIMESTAMPTZ,
      finished_at TIMESTAMPTZ,
      metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_runs_run_uuid ON campaign_runs(run_uuid)");
  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_campaign_runs_campaign_created_at ON campaign_runs(campaign_id, created_at DESC)");
}

export async function ensureDefaultAudienceDefinitions(tenantPool) {
  const r = await tenantPool.query("SELECT id FROM audience_definitions LIMIT 1");
  if ((r.rows || []).length > 0) return;

  const defaults = [
    {
      key: "autos_expiran_30d",
      name: "Autos - Expiran en 30 días",
      description: "Clientes con póliza de autos que vence en <= 30 días",
      filter: {
        all: [
          { field: "line", op: "eq", value: "autos" },
          { field: "days_left", op: "lte", value: 30 },
        ],
      },
    },
    {
      key: "vida_monto_alto",
      name: "Vida - Monto alto",
      description: "Clientes de vida con monto >= 100000",
      filter: {
        all: [
          { field: "line", op: "eq", value: "vida" },
          { field: "monto", op: "gte", value: 100000 },
        ],
      },
    },
    {
      key: "cuota_impaga",
      name: "Cuota impaga",
      description: "Clientes con cuota_paga=NO",
      filter: { field: "cuota_paga", op: "eq", value: "NO" },
    },
  ];

  for (const d of defaults) {
    await tenantPool.query(
      `
      INSERT INTO audience_definitions(key, version, name, description, filter, is_active)
      VALUES ($1, 1, $2, $3, $4::jsonb, TRUE)
      `,
      [d.key, d.name, d.description, JSON.stringify(d.filter)]
    );
  }
}

function evalLeafCondition(leaf, features) {
  const field = safeTrim(leaf?.field);
  const op = safeTrim(leaf?.op).toLowerCase();
  const expected = leaf?.value;

  if (!field) return { ok: false, matched: false, reason: "missing_field" };

  const actual = features[field];

  if (op === "exists") {
    return { ok: true, matched: actual !== null && actual !== undefined && safeTrim(actual) !== "" };
  }

  if (op === "empty") {
    return { ok: true, matched: actual === null || actual === undefined || safeTrim(actual) === "" };
  }

  if (op === "eq") {
    if (expected === null) return { ok: true, matched: actual === null || actual === undefined };
    return { ok: true, matched: safeTrim(actual).toLowerCase() === safeTrim(expected).toLowerCase() };
  }

  if (op === "neq") {
    if (expected === null) return { ok: true, matched: !(actual === null || actual === undefined) };
    return { ok: true, matched: safeTrim(actual).toLowerCase() !== safeTrim(expected).toLowerCase() };
  }

  if (["gt", "gte", "lt", "lte"].includes(op)) {
    const a = parseNumber(actual);
    const b = parseNumber(expected);
    if (a === null || b === null) return { ok: false, matched: false, reason: "not_a_number" };
    if (op === "gt") return { ok: true, matched: a > b };
    if (op === "gte") return { ok: true, matched: a >= b };
    if (op === "lt") return { ok: true, matched: a < b };
    if (op === "lte") return { ok: true, matched: a <= b };
  }

  if (op === "contains") {
    const a = safeTrim(actual).toLowerCase();
    const b = safeTrim(expected).toLowerCase();
    return { ok: true, matched: !!b && a.includes(b) };
  }

  return { ok: false, matched: false, reason: `unsupported_op:${op || ""}` };
}

function evalCondition(node, features) {
  const cond = safeJson(node, {});

  if (Array.isArray(cond.all)) {
    const parts = cond.all.map((c) => evalCondition(c, features));
    const ok = parts.every((p) => p.ok);
    const matched = parts.every((p) => p.matched);
    return { ok, matched, details: { op: "all", parts } };
  }

  if (Array.isArray(cond.any)) {
    const parts = cond.any.map((c) => evalCondition(c, features));
    const ok = parts.every((p) => p.ok);
    const matched = parts.some((p) => p.matched);
    return { ok, matched, details: { op: "any", parts } };
  }

  if (cond.not) {
    const inner = evalCondition(cond.not, features);
    return { ok: inner.ok, matched: !inner.matched, details: { op: "not", inner } };
  }

  const leaf = evalLeafCondition(cond, features);
  return { ok: leaf.ok, matched: leaf.matched, details: { op: "leaf", leaf: cond, leaf_result: leaf } };
}

function guessLineFromDescripcion(descripcion) {
  const d = safeTrim(descripcion).toLowerCase();
  if (!d) return "autos";
  if (d.includes("vida")) return "vida";
  if (d.includes("auto") || d.includes("veh") || d.includes("coche")) return "autos";
  return "autos";
}

function buildClienteFeatures({ clienteRow, asOfDate }) {
  const fechaFin = normalizeDateOnly(clienteRow?.fecha_fin_str) || normalizeDateOnly(clienteRow?.fecha_fin);

  let daysLeft = null;
  if (fechaFin && asOfDate) {
    try {
      const a = new Date(`${asOfDate}T00:00:00Z`);
      const b = new Date(`${fechaFin}T00:00:00Z`);
      if (!isNaN(a.getTime()) && !isNaN(b.getTime())) {
        daysLeft = Math.floor((b.getTime() - a.getTime()) / (24 * 60 * 60 * 1000));
      }
    } catch {
      // ignore
    }
  }

  return {
    id: clienteRow?.id ?? null,
    pais: safeTrim(clienteRow?.pais),
    nombre: safeTrim(clienteRow?.nombre),
    apellido: safeTrim(clienteRow?.apellido),
    mail: safeTrim(clienteRow?.mail),
    telefono: safeTrim(clienteRow?.telefono),
    documento: safeTrim(clienteRow?.documento),
    cuota_paga: safeTrim(clienteRow?.cuota_paga),
    monto: parseNumber(clienteRow?.monto),
    descripcion_seguro: safeTrim(clienteRow?.descripcion_seguro),
    line: guessLineFromDescripcion(clienteRow?.descripcion_seguro),
    fecha_fin: fechaFin,
    days_left: daysLeft,
  };
}

export async function listAudienceDefinitions(tenantPool) {
  const r = await tenantPool.query(
    `
    SELECT id, key, version, name, description, filter, is_active, created_at, updated_at
    FROM audience_definitions
    ORDER BY key ASC, version DESC, id DESC
    `
  );
  return r.rows || [];
}

export async function getAudienceDefinition(tenantPool, { definitionId }) {
  const id = Number(definitionId);
  if (!Number.isFinite(id)) throw new Error("definition_id inválido");

  const r = await tenantPool.query(
    "SELECT id, key, version, name, description, filter, is_active, created_at, updated_at FROM audience_definitions WHERE id=$1",
    [id]
  );
  if (r.rows.length === 0) throw new Error("audience_definition no encontrada");
  return r.rows[0];
}

export async function upsertAudienceDefinition(tenantPool, { key, name, description, filter, activate }) {
  const k = safeTrim(key);
  if (!k) throw new Error("key requerido");

  const nm = safeTrim(name);
  const desc = safeTrim(description);
  const f = safeJson(filter, {});

  const vr = await tenantPool.query("SELECT COALESCE(MAX(version),0)::int AS v FROM audience_definitions WHERE key=$1", [k]);
  const nextVersion = (vr.rows[0]?.v ?? 0) + 1;

  const ins = await tenantPool.query(
    `
    INSERT INTO audience_definitions(key, version, name, description, filter, is_active)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
    RETURNING id, key, version
    `,
    [k, nextVersion, nm, desc, JSON.stringify(f), activate === false ? false : true]
  );

  return ins.rows[0];
}

export async function runAudience({ tenantPool, definitionId, filterOverride, asOfDate, persist = true, actor }) {
  const asOf = normalizeDateOnly(asOfDate) || normalizeDateOnly(new Date().toISOString());
  const started = Date.now();

  let definition = null;
  let filter;

  if (definitionId) {
    definition = await getAudienceDefinition(tenantPool, { definitionId });
    filter = safeJson(definition.filter, {});
  } else {
    filter = safeJson(filterOverride, {});
  }

  const clientes = await tenantPool.query("SELECT * FROM clientes ORDER BY id ASC");

  const members = [];
  let totalMonto = 0;

  for (const row of clientes.rows || []) {
    const features = buildClienteFeatures({ clienteRow: row, asOfDate: asOf });
    let result;
    try {
      result = evalCondition(filter, features);
    } catch (e) {
      result = { ok: false, matched: false, details: { error: String(e?.message || e) } };
    }

    if (result?.matched) {
      members.push({ cliente_id: Number(row.id), features });
      const m = parseNumber(row?.monto);
      if (m !== null) totalMonto += m;
    }
  }

  const computedMs = Date.now() - started;

  const meta = {
    filter_hash: sha256(JSON.stringify(filter)),
    engine_version: "v1",
    total_monto: totalMonto,
  };

  let persisted = null;

  if (persist) {
    const client = await tenantPool.connect();
    try {
      await client.query("BEGIN");

      const runIns = await client.query(
        `
        INSERT INTO audience_runs(
          definition_id, definition_key, definition_version,
          as_of_date, filter_snapshot,
          total_members, meta,
          computed_ms,
          computed_by_mode, computed_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7::jsonb,$8,$9,$10)
        RETURNING id, run_uuid, created_at
        `,
        [
          definition?.id ?? null,
          safeTrim(definition?.key || ""),
          Number.isFinite(Number(definition?.version)) ? Number(definition?.version) : null,
          asOf,
          JSON.stringify(filter),
          members.length,
          JSON.stringify(meta),
          computedMs,
          safeTrim(actor?.mode || ""),
          safeTrim(actor?.user_id || ""),
        ]
      );

      const runId = runIns.rows[0].id;

      for (const m of members) {
        await client.query(
          `
          INSERT INTO audience_run_members(run_id, cliente_id, features)
          VALUES ($1,$2,$3::jsonb)
          `,
          [runId, m.cliente_id, JSON.stringify(m.features)]
        );
      }

      await client.query("COMMIT");
      persisted = { run_uuid: runIns.rows[0].run_uuid, created_at: runIns.rows[0].created_at };
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // ignore
      }
      throw e;
    } finally {
      client.release();
    }
  }

  return {
    as_of_date: asOf,
    total_members: members.length,
    estimated_impact: { total_monto: totalMonto },
    computed_ms: computedMs,
    persisted,
  };
}

export async function listAudienceRuns(tenantPool, { definitionId, limit = 50 }) {
  const defId = definitionId ? Number(definitionId) : null;
  if (defId && !Number.isFinite(defId)) throw new Error("definition_id inválido");
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  const r = await tenantPool.query(
    `
    SELECT run_uuid, definition_id, definition_key, definition_version, as_of_date, total_members, meta, computed_ms, created_at
    FROM audience_runs
    WHERE ($1::bigint IS NULL OR definition_id = $1::bigint)
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [defId, lim]
  );

  return r.rows || [];
}

export async function getAudienceRunMembers(tenantPool, { runUuid, limit = 100, offset = 0 }) {
  const uuid = safeTrim(runUuid);
  if (!uuid) throw new Error("run_uuid requerido");

  const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
  const off = Math.max(Number(offset) || 0, 0);

  const run = await tenantPool.query("SELECT id, run_uuid, total_members, created_at FROM audience_runs WHERE run_uuid=$1 LIMIT 1", [uuid]);
  if (run.rows.length === 0) throw new Error("audience_run no encontrado");

  const members = await tenantPool.query(
    `
    SELECT cliente_id, features
    FROM audience_run_members
    WHERE run_id = $1
    ORDER BY id ASC
    LIMIT $2 OFFSET $3
    `,
    [run.rows[0].id, lim, off]
  );

  return { run: run.rows[0], members: members.rows || [], limit: lim, offset: off };
}

export async function createCampaign(tenantPool, { key, name, line, channel, budget, expectedValue, config }) {
  const nm = safeTrim(name);
  if (!nm) throw new Error("name requerido");

  const ln = safeTrim(line || "autos") || "autos";
  const ch = safeTrim(channel || "whatsapp") || "whatsapp";

  const ins = await tenantPool.query(
    `
    INSERT INTO campaigns(key, name, line, channel, status, budget, expected_value, config)
    VALUES ($1,$2,$3,$4,'DRAFT',$5,$6,$7::jsonb)
    RETURNING id, key, name, line, channel, status, created_at
    `,
    [safeTrim(key || ""), nm, ln, ch, parseNumber(budget), parseNumber(expectedValue), JSON.stringify(safeJson(config, {}))]
  );

  return ins.rows[0];
}

export async function listCampaigns(tenantPool, { limit = 50 }) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const r = await tenantPool.query(
    `
    SELECT id, key, name, line, channel, status, budget, expected_value, created_at, updated_at
    FROM campaigns
    ORDER BY created_at DESC
    LIMIT $1
    `,
    [lim]
  );
  return r.rows || [];
}

export async function launchCampaign(tenantPool, { campaignId, audienceRunUuid }) {
  const id = Number(campaignId);
  if (!Number.isFinite(id)) throw new Error("campaign_id inválido");
  const uuid = safeTrim(audienceRunUuid);
  if (!uuid) throw new Error("audience_run_uuid requerido");

  const a = await tenantPool.query("SELECT id FROM audience_runs WHERE run_uuid=$1 LIMIT 1", [uuid]);
  if (a.rows.length === 0) throw new Error("audience_run no encontrado");

  const ins = await tenantPool.query(
    `
    INSERT INTO campaign_runs(campaign_id, audience_run_id, status, started_at)
    VALUES ($1,$2,'CREATED',NOW())
    RETURNING run_uuid, created_at
    `,
    [id, a.rows[0].id]
  );

  await tenantPool.query("UPDATE campaigns SET status='LAUNCHED', updated_at=NOW() WHERE id=$1", [id]);

  return { run_uuid: ins.rows[0].run_uuid, created_at: ins.rows[0].created_at };
}
