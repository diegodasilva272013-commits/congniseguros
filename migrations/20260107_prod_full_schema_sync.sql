-- Full, idempotent migration to sync the DB schema with the current project state
-- Date: 2026-01-07
-- Safe to run in production (EasyPanel) without losing data.
-- scope: master

BEGIN;

-- Extensiones
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =============================
-- TABLAS BASE (schema.sql)
-- =============================

CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fecha TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  rol VARCHAR(50) DEFAULT 'aseguradora',
  pais VARCHAR(2) DEFAULT 'AR',
  paises TEXT,
  wpp_phone_number_id TEXT,
  profile_photo BYTEA,
  profile_photo_mime TEXT,
  profile_photo_updated_at TIMESTAMP,
  trial_started_at TIMESTAMPTZ,
  trial_expires_at TIMESTAMPTZ,
  blocked_at TIMESTAMPTZ,
  blocked_reason TEXT,
  tenant_db TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asegurar columnas agregadas en runtime (por si la tabla ya existía)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS paises TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS trial_expires_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS blocked_reason TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tenant_db TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS wpp_phone_number_id TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_photo BYTEA;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_photo_mime TEXT;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS profile_photo_updated_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

CREATE TABLE IF NOT EXISTS clientes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguradora_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
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

CREATE INDEX IF NOT EXISTS idx_clientes_aseguradora ON clientes(aseguradora_id);
CREATE INDEX IF NOT EXISTS idx_clientes_documento ON clientes(documento);

CREATE TABLE IF NOT EXISTS configuracion (
  id SERIAL PRIMARY KEY,
  key VARCHAR(255) NOT NULL,
  value TEXT,
  scope VARCHAR(50) DEFAULT 'GLOBAL',
  scope_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(key, scope, scope_id)
);

CREATE INDEX IF NOT EXISTS idx_config_scope ON configuracion(scope, scope_id);

CREATE TABLE IF NOT EXISTS perfil_aseguradora (
  aseguradora_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_comercial VARCHAR(255),
  telefono VARCHAR(20),
  email VARCHAR(255),
  direccion TEXT,
  horarios TEXT,
  logo_dataurl TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =============================
-- MEMBRESÍA + SEGURIDAD (schema_seguridad.sql)
-- =============================

CREATE TABLE IF NOT EXISTS planes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  precio_mensual DECIMAL(10, 2) NOT NULL,
  precio_anual DECIMAL(10, 2),
  limite_clientes INT DEFAULT -1,
  limite_usuarios INT DEFAULT 1,
  soporta_whatsapp BOOLEAN DEFAULT false,
  soporta_openai BOOLEAN DEFAULT false,
  soporta_api_rest BOOLEAN DEFAULT false,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguradora_id UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  plan_id INT NOT NULL REFERENCES planes(id),
  estado VARCHAR(50) DEFAULT 'ACTIVA',
  fecha_inicio DATE NOT NULL,
  fecha_fin DATE,
  fecha_proximo_pago DATE,
  es_anual BOOLEAN DEFAULT false,
  ciclos_restantes INT DEFAULT 1,
  stripe_subscription_id VARCHAR(255),
  mercadopago_subscription_id VARCHAR(255),
  auto_renovacion BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguradora_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  suscripcion_id UUID REFERENCES suscripciones(id),
  monto DECIMAL(10, 2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'USD',
  concepto VARCHAR(255),
  estado VARCHAR(50) DEFAULT 'PENDIENTE',
  metodo_pago VARCHAR(50),
  referencia_externa VARCHAR(255),
  comprobante_url TEXT,
  fecha_pago TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Invitaciones (clave para claim + trial)
CREATE TABLE IF NOT EXISTS invitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  plan_id INT NOT NULL REFERENCES planes(id),
  email_asignado VARCHAR(255),
  email VARCHAR(255),
  usado BOOLEAN DEFAULT false,
  fecha_uso TIMESTAMP,
  aseguradora_id UUID REFERENCES usuarios(id),
  creado_por UUID REFERENCES usuarios(id),
  expira_en TIMESTAMP NOT NULL,
  trial_days INT,
  pais VARCHAR(2),
  paises TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Asegurar columnas en DBs viejas
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS email_asignado VARCHAR(255);
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS usado BOOLEAN DEFAULT false;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS fecha_uso TIMESTAMP;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS aseguradora_id UUID;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS creado_por UUID;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS expira_en TIMESTAMP;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS trial_days INT;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS pais VARCHAR(2);
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS paises TEXT;

-- Backfill mínimos
UPDATE invitaciones SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = '';
UPDATE invitaciones SET paises = COALESCE(NULLIF(TRIM(paises), ''), pais) WHERE paises IS NULL OR TRIM(paises) = '';

CREATE INDEX IF NOT EXISTS idx_invitaciones_codigo ON invitaciones(codigo);
CREATE INDEX IF NOT EXISTS idx_invitaciones_usado ON invitaciones(usado);

-- Auditoría (canonical sin tilde)
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

-- Compat columnas que algunas instalaciones tienen
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS timestamp TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_auditoria_usuario ON auditoria(usuario_id);

DO $$
BEGIN
  IF to_regclass('"auditoría"') IS NULL THEN
    EXECUTE 'CREATE VIEW "auditoría" AS SELECT * FROM auditoria';
  END IF;
EXCEPTION
  WHEN others THEN
    NULL;
END $$;

-- Tokens API
CREATE TABLE IF NOT EXISTS api_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguradora_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  token VARCHAR(255) UNIQUE NOT NULL,
  nombre VARCHAR(255),
  ultimo_uso TIMESTAMP,
  expira_en TIMESTAMP,
  activo BOOLEAN DEFAULT true,
  permisos TEXT[] DEFAULT ARRAY['read', 'write'],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_aseguradora ON api_tokens(aseguradora_id);

-- =============================
-- OTP (email_verification_codes) - requerido para auth sin contraseñas
-- =============================

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code_hash TEXT NOT NULL,
  code_plain TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE email_verification_codes ADD COLUMN IF NOT EXISTS code_plain TEXT;
CREATE INDEX IF NOT EXISTS ix_email_verification_codes_purpose_expires ON email_verification_codes(purpose, expires_at);

-- =============================
-- 2FA (schema_2fa.sql) - opcional, pero lo dejamos alineado al repo
-- =============================

CREATE TABLE IF NOT EXISTS dos_factores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL,
  contacto VARCHAR(255),
  codigo_actual VARCHAR(6),
  intentos_fallidos INT DEFAULT 0,
  bloqueado_hasta TIMESTAMP,
  habilitado BOOLEAN DEFAULT false,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultima_verificacion TIMESTAMP
);

CREATE TABLE IF NOT EXISTS backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  usado BOOLEAN DEFAULT false,
  fecha_uso TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_dos_factores_usuario ON dos_factores(usuario_id);
CREATE INDEX IF NOT EXISTS idx_backup_codes_usuario ON backup_codes(usuario_id);

COMMIT;
