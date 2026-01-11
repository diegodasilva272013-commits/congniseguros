-- 2026-01-10
-- scope: master
-- AutoGPT Orchestrator audit log (NO side effects in prod code; just persistence)
-- Idempotente.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS autogpt_runs (
  id BIGSERIAL PRIMARY KEY,

  -- Identificador estable para correlación externa
  run_uuid UUID NOT NULL DEFAULT gen_random_uuid(),

  -- Scope (text para compatibilidad con IDs SERIAL o UUID)
  aseguradora_id TEXT,
  tenant_db TEXT,

  -- Metadata de ejecución
  purpose TEXT NOT NULL DEFAULT 'analysis',
  status TEXT NOT NULL DEFAULT 'completed',
  model TEXT,

  prompt_version TEXT NOT NULL DEFAULT 'v1',
  prompt_template TEXT,
  prompt_hash TEXT,

  inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  outputs JSONB NOT NULL DEFAULT '{}'::jsonb,
  decisions JSONB NOT NULL DEFAULT '{}'::jsonb,

  error TEXT,

  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_autogpt_runs_run_uuid ON autogpt_runs(run_uuid);
CREATE INDEX IF NOT EXISTS ix_autogpt_runs_created_at ON autogpt_runs(created_at);
CREATE INDEX IF NOT EXISTS ix_autogpt_runs_aseguradora_created_at ON autogpt_runs(aseguradora_id, created_at);
CREATE INDEX IF NOT EXISTS ix_autogpt_runs_tenant_created_at ON autogpt_runs(tenant_db, created_at);
CREATE INDEX IF NOT EXISTS ix_autogpt_runs_status_created_at ON autogpt_runs(status, created_at);

COMMIT;
