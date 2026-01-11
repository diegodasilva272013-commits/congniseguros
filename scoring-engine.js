import crypto from "node:crypto";

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

const safeTrim = (v) => String(v ?? "").trim();

const normalizeDateOnly = (raw) => {
  const s = safeTrim(raw);
  if (!s) return null;
  const first10 = s.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(first10)) return null;
  return first10;
};

const parseNumber = (v) => {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v).replace(/,/g, ".").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

const sha256 = (text) => crypto.createHash("sha256").update(String(text ?? ""), "utf8").digest("hex");

export async function ensureTenantScoringSchema(tenantPool) {
  await tenantPool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => {});

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS scoring_rule_sets (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL,
      version INT NOT NULL DEFAULT 1,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(key, version)
    );
  `);

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS scoring_rules (
      id BIGSERIAL PRIMARY KEY,
      rule_set_id BIGINT NOT NULL REFERENCES scoring_rule_sets(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      priority INT NOT NULL DEFAULT 100,
      points NUMERIC NOT NULL DEFAULT 0,
      condition JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query(
    "CREATE INDEX IF NOT EXISTS ix_scoring_rules_rule_set_priority ON scoring_rules(rule_set_id, priority, id)"
  );

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS scoring_runs (
      id BIGSERIAL PRIMARY KEY,
      run_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
      rule_set_id BIGINT REFERENCES scoring_rule_sets(id) ON DELETE SET NULL,
      rule_set_key TEXT,
      rule_set_version INT,
      cliente_id INT,
      as_of_date DATE,
      score NUMERIC NOT NULL DEFAULT 0,
      band TEXT NOT NULL DEFAULT '',
      cliente_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      computed_ms INT,
      computed_by_mode TEXT,
      computed_by_user_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_scoring_runs_run_uuid ON scoring_runs(run_uuid)");
  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_scoring_runs_cliente_created_at ON scoring_runs(cliente_id, created_at DESC)");
  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_scoring_runs_created_at ON scoring_runs(created_at DESC)");

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS scoring_run_items (
      id BIGSERIAL PRIMARY KEY,
      run_id BIGINT NOT NULL REFERENCES scoring_runs(id) ON DELETE CASCADE,
      rule_id BIGINT REFERENCES scoring_rules(id) ON DELETE SET NULL,
      rule_name TEXT NOT NULL DEFAULT '',
      matched BOOLEAN NOT NULL DEFAULT FALSE,
      points NUMERIC NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      details JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_scoring_run_items_run_id ON scoring_run_items(run_id)");
}

export async function ensureDefaultScoringRuleSet(tenantPool) {
  const r = await tenantPool.query("SELECT id FROM scoring_rule_sets LIMIT 1");
  if ((r.rows || []).length > 0) return;

  const config = {
    bands: [
      { min: 80, label: "HOT" },
      { min: 50, label: "WARM" },
      { min: 0, label: "COLD" },
    ],
  };

  const insertSet = await tenantPool.query(
    `
    INSERT INTO scoring_rule_sets(key, version, name, description, config, is_active)
    VALUES ($1, $2, $3, $4, $5::jsonb, TRUE)
    RETURNING id, key, version
    `,
    ["default", 1, "Default v1", "Reglas iniciales (editable)", JSON.stringify(config)]
  );

  const ruleSetId = insertSet.rows[0].id;

  const rules = [
    {
      name: "Cuota impaga",
      description: "Cliente con cuota_paga=NO",
      priority: 10,
      points: 40,
      condition: { field: "cuota_paga", op: "eq", value: "NO" },
    },
    {
      name: "Vencimiento cercano",
      description: "Póliza vence en <= 15 días",
      priority: 20,
      points: 30,
      condition: { field: "days_left", op: "lte", value: 15 },
    },
    {
      name: "Monto alto",
      description: "monto >= 100000",
      priority: 30,
      points: 20,
      condition: { field: "monto", op: "gte", value: 100000 },
    },
    {
      name: "Sin email",
      description: "No hay mail cargado",
      priority: 90,
      points: 10,
      condition: { any: [{ field: "mail", op: "empty" }, { field: "mail", op: "eq", value: null }] },
    },
  ];

  for (const rule of rules) {
    await tenantPool.query(
      `
      INSERT INTO scoring_rules(rule_set_id, name, description, priority, points, condition, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE)
      `,
      [ruleSetId, rule.name, rule.description, rule.priority, rule.points, JSON.stringify(rule.condition)]
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

function resolveBand({ score, config }) {
  const c = safeJson(config, {});
  const bands = Array.isArray(c.bands) ? c.bands : [];
  const s = parseNumber(score) ?? 0;

  for (const b of bands) {
    const min = parseNumber(b?.min);
    const label = safeTrim(b?.label);
    if (min === null || !label) continue;
    if (s >= min) return label;
  }
  return "";
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
    fecha_fin: fechaFin,
    days_left: daysLeft,
  };
}

export async function listRuleSets(tenantPool) {
  const r = await tenantPool.query(
    `
    SELECT id, key, version, name, description, config, is_active, created_at, updated_at
    FROM scoring_rule_sets
    ORDER BY key ASC, version DESC, id DESC
    `
  );
  return r.rows || [];
}

export async function getRuleSetWithRules(tenantPool, { ruleSetId }) {
  const id = Number(ruleSetId);
  if (!Number.isFinite(id)) throw new Error("rule_set_id inválido");

  const rs = await tenantPool.query(
    "SELECT id, key, version, name, description, config, is_active, created_at, updated_at FROM scoring_rule_sets WHERE id=$1",
    [id]
  );
  if (rs.rows.length === 0) throw new Error("rule_set no encontrado");

  const rules = await tenantPool.query(
    `
    SELECT id, name, description, priority, points, condition, is_active, created_at, updated_at
    FROM scoring_rules
    WHERE rule_set_id=$1
    ORDER BY priority ASC, id ASC
    `,
    [id]
  );

  return { rule_set: rs.rows[0], rules: rules.rows || [] };
}

export async function upsertRuleSet(tenantPool, { key, name, description, config, rules, activate }) {
  const k = safeTrim(key) || "default";
  const nm = safeTrim(name);
  const desc = safeTrim(description);
  const cfg = safeJson(config, {});
  const rulesArr = Array.isArray(rules) ? rules : [];

  // Version = max(version)+1 for same key
  const vr = await tenantPool.query("SELECT COALESCE(MAX(version),0)::int AS v FROM scoring_rule_sets WHERE key=$1", [k]);
  const nextVersion = (vr.rows[0]?.v ?? 0) + 1;

  const insert = await tenantPool.query(
    `
    INSERT INTO scoring_rule_sets(key, version, name, description, config, is_active)
    VALUES ($1, $2, $3, $4, $5::jsonb, FALSE)
    RETURNING id, key, version
    `,
    [k, nextVersion, nm, desc, JSON.stringify(cfg)]
  );

  const ruleSetId = insert.rows[0].id;

  for (const r of rulesArr) {
    const rn = safeTrim(r?.name);
    if (!rn) continue;

    await tenantPool.query(
      `
      INSERT INTO scoring_rules(rule_set_id, name, description, priority, points, condition, is_active)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        ruleSetId,
        rn,
        safeTrim(r?.description),
        Number.isFinite(Number(r?.priority)) ? Number(r?.priority) : 100,
        parseNumber(r?.points) ?? 0,
        JSON.stringify(safeJson(r?.condition, {})),
        r?.is_active === false ? false : true,
      ]
    );
  }

  if (activate) {
    await activateRuleSet(tenantPool, { ruleSetId });
  }

  return { id: ruleSetId, key: k, version: nextVersion };
}

export async function activateRuleSet(tenantPool, { ruleSetId }) {
  const id = Number(ruleSetId);
  if (!Number.isFinite(id)) throw new Error("rule_set_id inválido");

  await tenantPool.query("UPDATE scoring_rule_sets SET is_active=FALSE, updated_at=NOW() WHERE is_active=TRUE");
  const r = await tenantPool.query(
    "UPDATE scoring_rule_sets SET is_active=TRUE, updated_at=NOW() WHERE id=$1 RETURNING id, key, version",
    [id]
  );
  if (r.rows.length === 0) throw new Error("rule_set no encontrado");
  return r.rows[0];
}

async function loadActiveRuleSet(tenantPool, { ruleSetId } = {}) {
  if (ruleSetId) {
    return getRuleSetWithRules(tenantPool, { ruleSetId });
  }

  const rs = await tenantPool.query(
    `
    SELECT id, key, version, name, description, config, is_active, created_at, updated_at
    FROM scoring_rule_sets
    WHERE is_active=TRUE
    ORDER BY key ASC, version DESC, id DESC
    LIMIT 1
    `
  );

  if (rs.rows.length === 0) {
    await ensureDefaultScoringRuleSet(tenantPool);
    return loadActiveRuleSet(tenantPool, { ruleSetId: null });
  }

  const ruleSet = rs.rows[0];
  const rules = await tenantPool.query(
    `
    SELECT id, name, description, priority, points, condition, is_active
    FROM scoring_rules
    WHERE rule_set_id=$1 AND is_active=TRUE
    ORDER BY priority ASC, id ASC
    `,
    [ruleSet.id]
  );

  return { rule_set: ruleSet, rules: rules.rows || [] };
}

export async function scoreCliente({
  tenantPool,
  clienteId,
  asOfDate,
  ruleSetId,
  persist = true,
  actor,
}) {
  const id = Number(clienteId);
  if (!Number.isFinite(id)) throw new Error("cliente_id inválido");

  const asOf = normalizeDateOnly(asOfDate) || normalizeDateOnly(new Date().toISOString());

  const started = Date.now();

  const { rule_set: ruleSet, rules } = await loadActiveRuleSet(tenantPool, { ruleSetId });

  const cliente = await tenantPool.query("SELECT * FROM clientes WHERE id=$1 LIMIT 1", [id]);
  if (cliente.rows.length === 0) throw new Error("cliente no encontrado");

  const clienteRow = cliente.rows[0];
  const features = buildClienteFeatures({ clienteRow, asOfDate: asOf });

  let score = 0;
  const items = [];

  for (const rule of rules) {
    const points = parseNumber(rule?.points) ?? 0;

    let result;
    try {
      result = evalCondition(rule?.condition, features);
    } catch (e) {
      result = { ok: false, matched: false, details: { error: String(e?.message || e) } };
    }

    const matched = !!result?.matched;
    if (matched) score += points;

    items.push({
      rule_id: rule.id,
      rule_name: rule.name,
      matched,
      points: matched ? points : 0,
      reason: matched ? "matched" : "not_matched",
      details: result?.details || {},
    });
  }

  const band = resolveBand({ score, config: ruleSet?.config || {} });
  const computedMs = Date.now() - started;

  const snapshot = {
    as_of_date: asOf,
    cliente: clienteRow,
    features,
  };

  const meta = {
    rule_set_hash: sha256(JSON.stringify({ ruleSet, rules })),
    engine_version: "v1",
  };

  let persisted = null;

  if (persist) {
    const client = await tenantPool.connect();
    try {
      await client.query("BEGIN");

      const runIns = await client.query(
        `
        INSERT INTO scoring_runs(
          rule_set_id, rule_set_key, rule_set_version,
          cliente_id, as_of_date,
          score, band,
          cliente_snapshot, meta,
          computed_ms,
          computed_by_mode, computed_by_user_id
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12)
        RETURNING id, run_uuid, created_at
        `,
        [
          ruleSet?.id ?? null,
          safeTrim(ruleSet?.key || ""),
          Number.isFinite(Number(ruleSet?.version)) ? Number(ruleSet?.version) : null,
          id,
          asOf,
          score,
          band,
          JSON.stringify(snapshot),
          JSON.stringify(meta),
          computedMs,
          safeTrim(actor?.mode || ""),
          safeTrim(actor?.user_id || ""),
        ]
      );

      const runId = runIns.rows[0].id;

      for (const it of items) {
        await client.query(
          `
          INSERT INTO scoring_run_items(run_id, rule_id, rule_name, matched, points, reason, details)
          VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
          `,
          [runId, it.rule_id ?? null, it.rule_name || "", it.matched, it.points, it.reason || "", JSON.stringify(it.details || {})]
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
    rule_set: {
      id: ruleSet?.id ?? null,
      key: ruleSet?.key ?? null,
      version: ruleSet?.version ?? null,
      name: ruleSet?.name ?? null,
    },
    cliente_id: id,
    as_of_date: asOf,
    score,
    band,
    computed_ms: computedMs,
    explain: items,
    persisted,
  };
}

export async function listScoringRuns(tenantPool, { clienteId, limit = 50 }) {
  const id = clienteId ? Number(clienteId) : null;
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);

  if (id && !Number.isFinite(id)) throw new Error("cliente_id inválido");

  const r = await tenantPool.query(
    `
    SELECT run_uuid, cliente_id, as_of_date, score, band, rule_set_key, rule_set_version, created_at, computed_ms
    FROM scoring_runs
    WHERE ($1::int IS NULL OR cliente_id = $1::int)
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [id, lim]
  );
  return r.rows || [];
}

export async function getScoringRun(tenantPool, { runUuid }) {
  const uuid = safeTrim(runUuid);
  if (!uuid) throw new Error("run_uuid requerido");

  const run = await tenantPool.query(
    `
    SELECT id, run_uuid, cliente_id, as_of_date, score, band, rule_set_key, rule_set_version,
           cliente_snapshot, meta, computed_ms, computed_by_mode, computed_by_user_id, created_at
    FROM scoring_runs
    WHERE run_uuid = $1
    LIMIT 1
    `,
    [uuid]
  );
  if (run.rows.length === 0) throw new Error("run no encontrado");

  const items = await tenantPool.query(
    `
    SELECT rule_id, rule_name, matched, points, reason, details
    FROM scoring_run_items
    WHERE run_id = $1
    ORDER BY id ASC
    `,
    [run.rows[0].id]
  );

  return { run: run.rows[0], items: items.rows || [] };
}
