-- scope: tenant

-- Sprint 3: Motor de Scoring (auditable)

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
