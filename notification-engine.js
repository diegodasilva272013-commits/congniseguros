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

function renderTemplate(template, ctx) {
  const body = String(template?.body_template || "");
  return body.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_m, key) => {
    const k = String(key || "").trim();
    if (!k) return "";
    const parts = k.split(".");
    let cur = ctx;
    for (const p of parts) {
      if (!cur || typeof cur !== "object") return "";
      cur = cur[p];
    }
    if (cur === null || cur === undefined) return "";
    return String(cur);
  });
}

export async function ensureTenantNotificationsSchema(tenantPool) {
  await tenantPool.query("CREATE EXTENSION IF NOT EXISTS pgcrypto").catch(() => {});

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      name TEXT NOT NULL DEFAULT '',
      body_template TEXT NOT NULL DEFAULT '',
      config JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_notification_templates_channel ON notification_templates(channel)");

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS notification_triggers (
      id BIGSERIAL PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL DEFAULT '',
      description TEXT NOT NULL DEFAULT '',
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      template_key TEXT NOT NULL,
      filter JSONB NOT NULL DEFAULT '{}'::jsonb,
      cooldown_sec INT NOT NULL DEFAULT 86400,
      max_retries INT NOT NULL DEFAULT 5,
      retry_backoff_sec INT NOT NULL DEFAULT 300,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query(
    "CREATE INDEX IF NOT EXISTS ix_notification_triggers_channel_active ON notification_triggers(channel, is_active)"
  );

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS notification_throttles (
      id BIGSERIAL PRIMARY KEY,
      trigger_key TEXT NOT NULL,
      cliente_id INT NOT NULL,
      last_enqueued_at TIMESTAMPTZ,
      last_sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(trigger_key, cliente_id)
    );
  `);

  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_notification_throttles_last_sent ON notification_throttles(last_sent_at DESC)");

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS notification_jobs (
      id BIGSERIAL PRIMARY KEY,
      job_uuid UUID NOT NULL DEFAULT gen_random_uuid(),
      trigger_key TEXT,
      template_key TEXT,
      channel TEXT NOT NULL DEFAULT 'whatsapp',
      cliente_id INT,
      to_phone TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      status TEXT NOT NULL DEFAULT 'QUEUED',
      attempts INT NOT NULL DEFAULT 0,
      next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_attempt_at TIMESTAMPTZ,
      last_error TEXT,
      meta JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_jobs_job_uuid ON notification_jobs(job_uuid)");
  await tenantPool.query(
    "CREATE INDEX IF NOT EXISTS ix_notification_jobs_status_next_attempt ON notification_jobs(status, next_attempt_at)"
  );
  await tenantPool.query(
    "CREATE INDEX IF NOT EXISTS ix_notification_jobs_cliente_created_at ON notification_jobs(cliente_id, created_at DESC)"
  );

  await tenantPool.query(`
    CREATE TABLE IF NOT EXISTS notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      job_id BIGINT NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
      attempt INT NOT NULL,
      status TEXT NOT NULL,
      provider TEXT,
      provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await tenantPool.query("CREATE INDEX IF NOT EXISTS ix_notification_deliveries_job_id ON notification_deliveries(job_id)");
}

export async function ensureDefaultNotificationConfig(tenantPool) {
  const t = await tenantPool.query("SELECT id FROM notification_templates LIMIT 1");
  if ((t.rows || []).length === 0) {
    await tenantPool.query(
      `
      INSERT INTO notification_templates(key, channel, name, body_template, config, is_active)
      VALUES
        ($1,'whatsapp',$2,$3,'{}'::jsonb,TRUE),
        ($4,'whatsapp',$5,$6,'{}'::jsonb,TRUE)
      ON CONFLICT (key) DO NOTHING
      `,
      [
        "wpp_vencimiento",
        "WhatsApp vencimiento",
        "Hola {{cliente.nombre}} {{cliente.apellido}}, su seguro está por vencer. Le quedan {{features.days_left}} día(s). ¿Coordinamos la renovación?",
        "wpp_pago",
        "WhatsApp pago",
        "Hola {{cliente.nombre}} {{cliente.apellido}}, su cuota ha vencido. Monto: {{features.monto}}. Por favor regularice para ponerse al día.",
      ]
    );
  }

  const r = await tenantPool.query("SELECT id FROM notification_triggers LIMIT 1");
  if ((r.rows || []).length === 0) {
    const defaults = [
      {
        key: "vencimiento_15d",
        name: "Vencimiento <= 15 días",
        description: "Envía WhatsApp a clientes con póliza por vencer",
        channel: "whatsapp",
        template_key: "wpp_vencimiento",
        cooldown_sec: 86400,
        filter: { all: [{ field: "days_left", op: "lte", value: 15 }, { field: "telefono", op: "exists" }] },
      },
      {
        key: "cuota_impaga",
        name: "Cuota impaga",
        description: "Envía WhatsApp a clientes con cuota_paga=NO",
        channel: "whatsapp",
        template_key: "wpp_pago",
        cooldown_sec: 86400,
        filter: { all: [{ field: "cuota_paga", op: "eq", value: "NO" }, { field: "telefono", op: "exists" }] },
      },
    ];

    for (const d of defaults) {
      await tenantPool.query(
        `
        INSERT INTO notification_triggers(
          key, name, description, channel, template_key, filter, cooldown_sec,
          max_retries, retry_backoff_sec, is_active
        )
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,5,300,TRUE)
        ON CONFLICT (key) DO NOTHING
        `,
        [d.key, d.name, d.description, d.channel, d.template_key, JSON.stringify(d.filter), d.cooldown_sec]
      );
    }
  }
}

export async function listNotificationTemplates(tenantPool) {
  const r = await tenantPool.query(
    `
    SELECT id, key, channel, name, body_template, config, is_active, created_at, updated_at
    FROM notification_templates
    ORDER BY key ASC
    `
  );
  return r.rows || [];
}

export async function upsertNotificationTemplate(tenantPool, { key, channel, name, bodyTemplate, config, isActive }) {
  const k = safeTrim(key);
  if (!k) throw new Error("key requerido");

  const ch = safeTrim(channel || "whatsapp") || "whatsapp";

  const r = await tenantPool.query(
    `
    INSERT INTO notification_templates(key, channel, name, body_template, config, is_active)
    VALUES ($1,$2,$3,$4,$5::jsonb,$6)
    ON CONFLICT (key) DO UPDATE SET
      channel=EXCLUDED.channel,
      name=EXCLUDED.name,
      body_template=EXCLUDED.body_template,
      config=EXCLUDED.config,
      is_active=EXCLUDED.is_active,
      updated_at=NOW()
    RETURNING id, key, channel, name, is_active, updated_at
    `,
    [k, ch, safeTrim(name), String(bodyTemplate || ""), JSON.stringify(safeJson(config, {})), isActive === false ? false : true]
  );

  return r.rows[0];
}

export async function listNotificationTriggers(tenantPool) {
  const r = await tenantPool.query(
    `
    SELECT id, key, name, description, channel, template_key, filter, cooldown_sec, max_retries, retry_backoff_sec, is_active, created_at, updated_at
    FROM notification_triggers
    ORDER BY key ASC
    `
  );
  return r.rows || [];
}

export async function upsertNotificationTrigger(
  tenantPool,
  { key, name, description, channel, templateKey, filter, cooldownSec, maxRetries, retryBackoffSec, isActive }
) {
  const k = safeTrim(key);
  if (!k) throw new Error("key requerido");

  const ch = safeTrim(channel || "whatsapp") || "whatsapp";
  const tmpl = safeTrim(templateKey);
  if (!tmpl) throw new Error("template_key requerido");

  const r = await tenantPool.query(
    `
    INSERT INTO notification_triggers(
      key, name, description, channel, template_key, filter,
      cooldown_sec, max_retries, retry_backoff_sec, is_active
    )
    VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
    ON CONFLICT (key) DO UPDATE SET
      name=EXCLUDED.name,
      description=EXCLUDED.description,
      channel=EXCLUDED.channel,
      template_key=EXCLUDED.template_key,
      filter=EXCLUDED.filter,
      cooldown_sec=EXCLUDED.cooldown_sec,
      max_retries=EXCLUDED.max_retries,
      retry_backoff_sec=EXCLUDED.retry_backoff_sec,
      is_active=EXCLUDED.is_active,
      updated_at=NOW()
    RETURNING id, key, is_active, updated_at
    `,
    [
      k,
      safeTrim(name),
      safeTrim(description),
      ch,
      tmpl,
      JSON.stringify(safeJson(filter, {})),
      Number.isFinite(Number(cooldownSec)) ? Number(cooldownSec) : 86400,
      Number.isFinite(Number(maxRetries)) ? Number(maxRetries) : 5,
      Number.isFinite(Number(retryBackoffSec)) ? Number(retryBackoffSec) : 300,
      isActive === false ? false : true,
    ]
  );

  return r.rows[0];
}

async function getActiveTriggers(tenantPool) {
  const r = await tenantPool.query(
    `
    SELECT key, channel, template_key, filter, cooldown_sec, max_retries, retry_backoff_sec
    FROM notification_triggers
    WHERE is_active=TRUE
    ORDER BY key ASC
    `
  );
  return r.rows || [];
}

async function loadTemplatesMap(tenantPool) {
  const r = await tenantPool.query(
    `
    SELECT key, channel, body_template, config
    FROM notification_templates
    WHERE is_active=TRUE
    ORDER BY key ASC
    `
  );
  const map = new Map();
  for (const row of r.rows || []) map.set(String(row.key), row);
  return map;
}

async function shouldEnqueue({ tenantPool, triggerKey, clienteId, cooldownSec }) {
  const id = Number(clienteId);
  if (!Number.isFinite(id)) return { ok: false, reason: "invalid_cliente_id" };

  // 1) evitar duplicado si hay job pendiente
  const pending = await tenantPool.query(
    `
    SELECT 1
    FROM notification_jobs
    WHERE trigger_key=$1 AND cliente_id=$2 AND status IN ('QUEUED','SENDING')
    LIMIT 1
    `,
    [triggerKey, id]
  );
  if ((pending.rows || []).length > 0) return { ok: false, reason: "already_pending" };

  // 2) rate limit por last_sent_at
  const thr = await tenantPool.query(
    `
    SELECT last_sent_at
    FROM notification_throttles
    WHERE trigger_key=$1 AND cliente_id=$2
    LIMIT 1
    `,
    [triggerKey, id]
  );

  const lastSent = thr.rows?.[0]?.last_sent_at ? new Date(thr.rows[0].last_sent_at) : null;
  if (lastSent && !isNaN(lastSent.getTime())) {
    const deltaSec = Math.floor((Date.now() - lastSent.getTime()) / 1000);
    if (deltaSec >= 0 && deltaSec < Number(cooldownSec || 0)) {
      return { ok: false, reason: "cooldown" };
    }
  }

  return { ok: true };
}

async function markThrottleEnqueued({ tenantPool, triggerKey, clienteId }) {
  await tenantPool.query(
    `
    INSERT INTO notification_throttles(trigger_key, cliente_id, last_enqueued_at, updated_at)
    VALUES ($1,$2,NOW(),NOW())
    ON CONFLICT (trigger_key, cliente_id) DO UPDATE SET
      last_enqueued_at=NOW(),
      updated_at=NOW()
    `,
    [triggerKey, Number(clienteId)]
  );
}

async function markThrottleSent({ tenantPool, triggerKey, clienteId }) {
  await tenantPool.query(
    `
    INSERT INTO notification_throttles(trigger_key, cliente_id, last_sent_at, updated_at)
    VALUES ($1,$2,NOW(),NOW())
    ON CONFLICT (trigger_key, cliente_id) DO UPDATE SET
      last_sent_at=NOW(),
      updated_at=NOW()
    `,
    [triggerKey, Number(clienteId)]
  );
}

export async function detectAndEnqueueNotifications({ tenantPool, triggerKey, asOfDate, dryRun = true, max = 200, actor }) {
  const asOf = normalizeDateOnly(asOfDate) || normalizeDateOnly(new Date().toISOString());

  const templates = await loadTemplatesMap(tenantPool);
  const triggers = await getActiveTriggers(tenantPool);
  const selected = triggerKey ? triggers.filter((t) => String(t.key) === String(triggerKey)) : triggers;

  const clientes = await tenantPool.query("SELECT * FROM clientes ORDER BY id ASC");

  const actions = [];

  for (const trig of selected) {
    const filter = safeJson(trig.filter, {});

    for (const c of clientes.rows || []) {
      const features = buildClienteFeatures({ clienteRow: c, asOfDate: asOf });
      let matched = false;
      try {
        matched = !!evalCondition(filter, features)?.matched;
      } catch {
        matched = false;
      }

      if (!matched) continue;

      const toPhone = safeTrim(c?.telefono);
      if (!toPhone) continue;

      const can = await shouldEnqueue({ tenantPool, triggerKey: trig.key, clienteId: c.id, cooldownSec: trig.cooldown_sec });
      if (!can.ok) continue;

      const tmpl = templates.get(String(trig.template_key));
      const body = renderTemplate(tmpl, { cliente: c, features });

      const payload = {
        to: toPhone,
        body,
        cliente_id: Number(c.id),
        trigger_key: String(trig.key),
        as_of_date: asOf,
      };

      actions.push({ trigger_key: trig.key, cliente_id: Number(c.id), to_phone: toPhone, payload });
      if (actions.length >= Math.min(Math.max(Number(max) || 200, 1), 2000)) break;
    }

    if (actions.length >= Math.min(Math.max(Number(max) || 200, 1), 2000)) break;
  }

  if (dryRun) {
    return { as_of_date: asOf, dry_run: true, matched: actions.length, enqueued: 0, preview: actions.slice(0, 20) };
  }

  const client = await tenantPool.connect();
  let enqueued = 0;
  try {
    await client.query("BEGIN");

    for (const a of actions) {
      await client.query(
        `
        INSERT INTO notification_jobs(
          trigger_key, template_key, channel, cliente_id, to_phone, payload,
          status, attempts, next_attempt_at, meta
        )
        VALUES ($1, (SELECT template_key FROM notification_triggers WHERE key=$1 LIMIT 1), 'whatsapp', $2, $3, $4::jsonb,
                'QUEUED', 0, NOW(), $5::jsonb)
        `,
        [
          String(a.trigger_key),
          Number(a.cliente_id),
          String(a.to_phone),
          JSON.stringify(a.payload),
          JSON.stringify({ actor: actor || {}, dedupe_hash: sha256(`${a.trigger_key}|${a.cliente_id}`) }),
        ]
      );
      await markThrottleEnqueued({ tenantPool: client, triggerKey: a.trigger_key, clienteId: a.cliente_id });
      enqueued += 1;
    }

    await client.query("COMMIT");
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

  return { as_of_date: asOf, dry_run: false, matched: actions.length, enqueued, preview: actions.slice(0, 20) };
}

export async function listNotificationJobs(tenantPool, { status, limit = 50 }) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const st = safeTrim(status);

  const r = await tenantPool.query(
    `
    SELECT job_uuid, trigger_key, channel, cliente_id, to_phone, status, attempts, next_attempt_at, last_error, created_at, updated_at
    FROM notification_jobs
    WHERE ($1::text IS NULL OR status = $1::text)
    ORDER BY created_at DESC
    LIMIT $2
    `,
    [st ? st : null, lim]
  );

  return r.rows || [];
}

export async function processNotificationQueue({ tenantPool, maxJobs = 50, sendFn, provider = "whatsapp" }) {
  if (typeof sendFn !== "function") throw new Error("sendFn requerido");

  const max = Math.min(Math.max(Number(maxJobs) || 50, 1), 200);

  const jobs = await tenantPool.query(
    `
    SELECT id, job_uuid, trigger_key, template_key, channel, cliente_id, to_phone, payload, attempts, next_attempt_at
    FROM notification_jobs
    WHERE status IN ('QUEUED','RETRY')
      AND next_attempt_at <= NOW()
    ORDER BY next_attempt_at ASC, id ASC
    LIMIT $1
    `,
    [max]
  );

  const processed = [];

  for (const j of jobs.rows || []) {
    const client = await tenantPool.connect();
    try {
      await client.query("BEGIN");

      const lock = await client.query(
        `
        UPDATE notification_jobs
        SET status='SENDING', updated_at=NOW()
        WHERE id=$1 AND status IN ('QUEUED','RETRY')
        RETURNING id
        `,
        [Number(j.id)]
      );
      if (lock.rows.length === 0) {
        await client.query("ROLLBACK");
        client.release();
        continue;
      }

      await client.query(
        `
        UPDATE notification_jobs
        SET attempts = attempts + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE id=$1
        `,
        [Number(j.id)]
      );

      const attemptNo = Number(j.attempts || 0) + 1;

      let sendResult;
      try {
        sendResult = await sendFn({
          channel: j.channel,
          to: safeTrim(j.to_phone),
          payload: safeJson(j.payload, {}),
        });

        await client.query(
          `
          INSERT INTO notification_deliveries(job_id, attempt, status, provider, provider_response)
          VALUES ($1,$2,'SENT',$3,$4::jsonb)
          `,
          [Number(j.id), attemptNo, provider, JSON.stringify(safeJson(sendResult, {}))]
        );

        await client.query(
          `
          UPDATE notification_jobs
          SET status='SENT', last_error=NULL, updated_at=NOW()
          WHERE id=$1
          `,
          [Number(j.id)]
        );

        if (j.trigger_key && Number.isFinite(Number(j.cliente_id))) {
          await markThrottleSent({ tenantPool: client, triggerKey: String(j.trigger_key), clienteId: Number(j.cliente_id) });
        }

        await client.query("COMMIT");
        processed.push({ job_uuid: j.job_uuid, status: "SENT" });
      } catch (e) {
        const msg = String(e?.message || e);

        await client.query(
          `
          INSERT INTO notification_deliveries(job_id, attempt, status, provider, provider_response)
          VALUES ($1,$2,'FAILED',$3,$4::jsonb)
          `,
          [Number(j.id), attemptNo, provider, JSON.stringify({ error: msg })]
        );

        const trig = await client.query(
          `
          SELECT max_retries, retry_backoff_sec
          FROM notification_triggers
          WHERE key=$1
          LIMIT 1
          `,
          [String(j.trigger_key || "")]
        );

        const maxRetries = Number(trig.rows?.[0]?.max_retries ?? 5);
        const backoffSec = Number(trig.rows?.[0]?.retry_backoff_sec ?? 300);

        const shouldRetry = attemptNo < Math.max(1, maxRetries);
        const nextAt = shouldRetry
          ? new Date(Date.now() + backoffSec * 1000).toISOString()
          : null;

        await client.query(
          `
          UPDATE notification_jobs
          SET status = $2,
              last_error = $3,
              next_attempt_at = COALESCE($4::timestamptz, next_attempt_at),
              updated_at = NOW()
          WHERE id=$1
          `,
          [Number(j.id), shouldRetry ? "RETRY" : "FAILED", msg.slice(0, 2000), nextAt]
        );

        await client.query("COMMIT");
        processed.push({ job_uuid: j.job_uuid, status: shouldRetry ? "RETRY" : "FAILED" });
      }
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

  return { processed };
}
