-- Tenant schema (una DB por aseguradora)

CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  pais VARCHAR(2) DEFAULT 'AR',
  nombre VARCHAR(255) NOT NULL,
  apellido VARCHAR(255),
  mail VARCHAR(255),
  telefono VARCHAR(20),
  documento VARCHAR(20),
  polizas TEXT,
  grua_telefono VARCHAR(20),
  grua_nombre VARCHAR(255),
  descripcion_seguro TEXT,
  fecha_inicio_str VARCHAR(50),
  fecha_fin_str VARCHAR(50),
  fechas_de_cuota TEXT,
  cuota_paga VARCHAR(10) DEFAULT 'NO',
  monto DECIMAL(10, 2),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

DROP INDEX IF EXISTS ux_clientes_documento;
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pais_documento ON clientes(pais, documento);

CREATE TABLE IF NOT EXISTS configuracion (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  value TEXT,
  scope VARCHAR(50) DEFAULT 'GLOBAL',
  scope_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key, scope, scope_id)
);

CREATE TABLE IF NOT EXISTS perfil_aseguradora (
  id SERIAL PRIMARY KEY,
  nombre_comercial VARCHAR(255),
  telefono VARCHAR(20),
  email VARCHAR(255),
  direccion TEXT,
  horarios TEXT,
  logo_dataurl TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- WhatsApp Inbox (Mensajes)
CREATE TABLE IF NOT EXISTS whatsapp_conversations (
  id BIGSERIAL PRIMARY KEY,
  wa_contact VARCHAR(64) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  status TEXT DEFAULT 'PENDIENTE',
  intent TEXT DEFAULT 'general',
  opened_at TIMESTAMPTZ DEFAULT NOW(),
  last_inbound_at TIMESTAMPTZ,
  last_outbound_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  last_actor TEXT DEFAULT 'cliente',
  assigned_to TEXT,
  requires_template BOOLEAN DEFAULT FALSE,
  resolution_type TEXT,
  reopened_count INT DEFAULT 0,
  waba_phone_number_id TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_conversations_wa_contact ON whatsapp_conversations(wa_contact);
CREATE INDEX IF NOT EXISTS ix_whatsapp_conversations_status_last_inbound ON whatsapp_conversations(status, last_inbound_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_whatsapp_conversations_intent_last_inbound ON whatsapp_conversations(intent, last_inbound_at DESC NULLS LAST);

CREATE TABLE IF NOT EXISTS whatsapp_messages (
  id BIGSERIAL PRIMARY KEY,
  conversation_id BIGINT NOT NULL REFERENCES whatsapp_conversations(id) ON DELETE CASCADE,
  direction VARCHAR(8) NOT NULL CHECK (direction IN ('in','out')),
  wa_message_id VARCHAR(128),
  from_phone VARCHAR(32) NOT NULL,
  to_phone VARCHAR(32) NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  wa_timestamp BIGINT,
  actor TEXT DEFAULT 'cliente',
  type TEXT DEFAULT 'text',
  content_meta JSONB,
  delivery_status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Nota: índice UNIQUE no-parcial para permitir ON CONFLICT(wa_message_id)
CREATE UNIQUE INDEX IF NOT EXISTS ux_whatsapp_messages_wa_message_id_full ON whatsapp_messages(wa_message_id);
CREATE INDEX IF NOT EXISTS ix_whatsapp_messages_conversation_created_at ON whatsapp_messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS ix_whatsapp_messages_conversation_created_at_desc ON whatsapp_messages(conversation_id, created_at DESC);

-- ===== Motor de Scoring (Sprint 3) =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS ix_scoring_rules_rule_set_priority ON scoring_rules(rule_set_id, priority, id);

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_scoring_runs_run_uuid ON scoring_runs(run_uuid);
CREATE INDEX IF NOT EXISTS ix_scoring_runs_cliente_created_at ON scoring_runs(cliente_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_scoring_runs_created_at ON scoring_runs(created_at DESC);

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

CREATE INDEX IF NOT EXISTS ix_scoring_run_items_run_id ON scoring_run_items(run_id);

-- ===== Campañas y Audiencias (Sprint 4) =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_audience_runs_run_uuid ON audience_runs(run_uuid);
CREATE INDEX IF NOT EXISTS ix_audience_runs_created_at ON audience_runs(created_at DESC);
CREATE INDEX IF NOT EXISTS ix_audience_runs_definition_created_at ON audience_runs(definition_id, created_at DESC);

CREATE TABLE IF NOT EXISTS audience_run_members (
  id BIGSERIAL PRIMARY KEY,
  run_id BIGINT NOT NULL REFERENCES audience_runs(id) ON DELETE CASCADE,
  cliente_id INT NOT NULL,
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_audience_run_members_run_id ON audience_run_members(run_id);
CREATE INDEX IF NOT EXISTS ix_audience_run_members_cliente_id ON audience_run_members(cliente_id);

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

CREATE INDEX IF NOT EXISTS ix_campaigns_status_created_at ON campaigns(status, created_at DESC);

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

CREATE UNIQUE INDEX IF NOT EXISTS ux_campaign_runs_run_uuid ON campaign_runs(run_uuid);
CREATE INDEX IF NOT EXISTS ix_campaign_runs_campaign_created_at ON campaign_runs(campaign_id, created_at DESC);

-- ===== Notificaciones (Sprint 5) =====
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
