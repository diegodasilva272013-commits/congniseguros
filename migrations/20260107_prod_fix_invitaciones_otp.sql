-- Migración segura (idempotente) para producción
-- Fecha: 2026-01-07
-- Objetivo: dejar DB alineada a los flujos actuales (invitaciones + OTP + auditoría)
-- scope: master

BEGIN;

-- ===== INVITACIONES =====
DO $$
BEGIN
  IF to_regclass('invitaciones') IS NOT NULL THEN
    ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS email_asignado TEXT;
    ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS pais VARCHAR(2);
    ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS paises TEXT;
    ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS fecha_uso TIMESTAMP;
    ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS trial_days INT;

    -- Backfill mínimos
    UPDATE invitaciones SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = '';
    UPDATE invitaciones
    SET paises = COALESCE(NULLIF(TRIM(paises), ''), pais)
    WHERE paises IS NULL OR TRIM(paises) = '';

    -- Índices (si tu Postgres soporta IF NOT EXISTS)
    CREATE INDEX IF NOT EXISTS idx_invitaciones_codigo ON invitaciones(codigo);
    CREATE INDEX IF NOT EXISTS idx_invitaciones_usado ON invitaciones(usado);
  END IF;
END $$;

-- ===== AUDITORIA (canonical sin tilde) =====
CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$
BEGIN
  -- Si usuarios todavía no existe (DB vacía), evitamos romper.
  IF to_regclass('usuarios') IS NOT NULL THEN
    CREATE TABLE IF NOT EXISTS auditoria (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      usuario_id UUID REFERENCES usuarios(id),
      accion VARCHAR(255) NOT NULL,
      recurso VARCHAR(100),
      recurso_id VARCHAR(255),
      ip_address VARCHAR(45),
      user_agent TEXT,
      detalles JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);
  END IF;
END $$;

-- Compat: crear VIEW "auditoría" solo si NO existe nada con ese nombre.
DO $$
BEGIN
  IF to_regclass('"auditoría"') IS NULL THEN
    EXECUTE 'CREATE VIEW "auditoría" AS SELECT * FROM auditoria';
  END IF;
EXCEPTION
  WHEN others THEN
    -- Si falla por permisos o porque existe como tabla, no rompemos la migración.
    NULL;
END $$;

COMMIT;
