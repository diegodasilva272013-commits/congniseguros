-- scope: tenant

-- Sprint 4: Campañas y Audiencias (segmentación auditable)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Definiciones de audiencia (segmentos)
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

-- Campañas (definición)
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

-- Ejecuciones / envíos (trazabilidad)
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
