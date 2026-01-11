-- scope: tenant

-- Sprint 5: Notificaciones (triggers + rate limit + logs + retries)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS ix_notification_templates_channel ON notification_templates(channel);

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

CREATE INDEX IF NOT EXISTS ix_notification_triggers_channel_active ON notification_triggers(channel, is_active);

-- Dedupe/rate-limit por cliente+trigger
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

CREATE INDEX IF NOT EXISTS ix_notification_throttles_last_sent ON notification_throttles(last_sent_at DESC);

-- Cola de notificaciones (retries)
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_notification_jobs_job_uuid ON notification_jobs(job_uuid);
CREATE INDEX IF NOT EXISTS ix_notification_jobs_status_next_attempt ON notification_jobs(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS ix_notification_jobs_cliente_created_at ON notification_jobs(cliente_id, created_at DESC);

-- Logs de delivery por intento
CREATE TABLE IF NOT EXISTS notification_deliveries (
  id BIGSERIAL PRIMARY KEY,
  job_id BIGINT NOT NULL REFERENCES notification_jobs(id) ON DELETE CASCADE,
  attempt INT NOT NULL,
  status TEXT NOT NULL,
  provider TEXT,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_notification_deliveries_job_id ON notification_deliveries(job_id);
