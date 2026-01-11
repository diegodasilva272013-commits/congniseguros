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

-- Detectar tipo real de usuarios.id en instalaciones legacy (puede ser INT/SERIAL)
-- y guardarlo en una setting para reusar en el resto de la migración.
DO $$
DECLARE
  usuarios_id_type TEXT;
BEGIN
  SELECT format_type(a.atttypid, a.atttypmod)
  INTO usuarios_id_type
  FROM pg_attribute a
  JOIN pg_class c ON c.oid = a.attrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'usuarios'
    AND a.attname = 'id'
    AND a.attnum > 0
    AND NOT a.attisdropped;

  IF usuarios_id_type IS NULL OR usuarios_id_type = '' THEN
    usuarios_id_type := 'uuid';
  END IF;

  PERFORM set_config('cogniseguros.usuarios_id_type', usuarios_id_type, true);
END $$;

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);

DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('clientes') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE clientes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aseguradora_id %s NOT NULL,
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
      )
    $SQL$, usuarios_id_type);
  END IF;

  -- Intentar agregar FK sin romper migración (puede fallar por tipos legacy o data)
  IF to_regclass('clientes') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'clientes_aseguradora_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE clientes ADD CONSTRAINT clientes_aseguradora_id_fkey FOREIGN KEY (aseguradora_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK clientes(aseguradora_id) -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

-- Compat: DBs viejas (setup-db legacy) pueden tener clientes sin aseguradora_id/documento/mail
DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('clientes') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'aseguradora_id'
    ) THEN
      EXECUTE format('ALTER TABLE clientes ADD COLUMN aseguradora_id %s', usuarios_id_type);
    END IF;
  END IF;
END $$;

ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mail VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS apellido VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuota_paga VARCHAR(10) DEFAULT 'NO';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS monto DECIMAL(10, 2);

-- Backfills suaves (no destruyen data)
DO $$
BEGIN
  IF to_regclass('clientes') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'cedula'
    ) THEN
      UPDATE clientes SET documento = cedula
      WHERE (documento IS NULL OR TRIM(documento) = '') AND cedula IS NOT NULL AND TRIM(cedula) <> '';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'email'
    ) THEN
      UPDATE clientes SET mail = email
      WHERE (mail IS NULL OR TRIM(mail) = '') AND email IS NOT NULL AND TRIM(email) <> '';
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'clientes' AND column_name = 'usuario_id'
    ) THEN
      -- Best-effort: si la instalación legacy guardaba usuario_id numérico,
      -- no podemos mapearlo a UUID sin una tabla de equivalencias.
      -- Dejamos aseguradora_id NULL para no romper la migración.
      NULL;
    END IF;
  END IF;
END $$;

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

DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('perfil_aseguradora') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE perfil_aseguradora (
        aseguradora_id %s PRIMARY KEY,
        nombre_comercial VARCHAR(255),
        telefono VARCHAR(20),
        email VARCHAR(255),
        direccion TEXT,
        horarios TEXT,
        logo_dataurl TEXT,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    $SQL$, usuarios_id_type);
  END IF;

  IF to_regclass('perfil_aseguradora') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'perfil_aseguradora_aseguradora_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE perfil_aseguradora ADD CONSTRAINT perfil_aseguradora_aseguradora_id_fkey FOREIGN KEY (aseguradora_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK perfil_aseguradora -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

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

DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('suscripciones') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE suscripciones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aseguradora_id %s NOT NULL UNIQUE,
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
      )
    $SQL$, usuarios_id_type);
  END IF;

  IF to_regclass('suscripciones') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'suscripciones_aseguradora_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE suscripciones ADD CONSTRAINT suscripciones_aseguradora_id_fkey FOREIGN KEY (aseguradora_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK suscripciones -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

-- Detectar tipo real de suscripciones.id en instalaciones legacy (puede ser INT/SERIAL)
-- y guardarlo en una setting para reusar en pagos.
DO $$
DECLARE
  suscripciones_id_type TEXT;
BEGIN
  IF to_regclass('suscripciones') IS NULL THEN
    suscripciones_id_type := 'uuid';
  ELSE
    SELECT format_type(a.atttypid, a.atttypmod)
    INTO suscripciones_id_type
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'suscripciones'
      AND a.attname = 'id'
      AND a.attnum > 0
      AND NOT a.attisdropped;

    IF suscripciones_id_type IS NULL OR suscripciones_id_type = '' THEN
      suscripciones_id_type := 'uuid';
    END IF;
  END IF;

  PERFORM set_config('cogniseguros.suscripciones_id_type', suscripciones_id_type, true);
END $$;

DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
  suscripciones_id_type TEXT := COALESCE(current_setting('cogniseguros.suscripciones_id_type', true), 'uuid');
BEGIN
  IF to_regclass('pagos') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE pagos (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aseguradora_id %s NOT NULL,
        suscripcion_id %s,
        monto DECIMAL(10, 2) NOT NULL,
        moneda VARCHAR(3) DEFAULT 'USD',
        concepto VARCHAR(255),
        estado VARCHAR(50) DEFAULT 'PENDIENTE',
        metodo_pago VARCHAR(50),
        referencia_externa VARCHAR(255),
        comprobante_url TEXT,
        fecha_pago TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    $SQL$, usuarios_id_type, suscripciones_id_type);
  END IF;

  IF to_regclass('pagos') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pagos_aseguradora_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE pagos ADD CONSTRAINT pagos_aseguradora_id_fkey FOREIGN KEY (aseguradora_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK pagos -> usuarios(id): %', SQLERRM;
    END;
  END IF;

  -- FK a suscripciones(id): best-effort (puede fallar si suscripciones.id es legacy o hay data inconsistent)
  IF to_regclass('pagos') IS NOT NULL
     AND to_regclass('suscripciones') IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pagos_suscripcion_id_fkey') THEN
    BEGIN
      EXECUTE 'ALTER TABLE pagos ADD CONSTRAINT pagos_suscripcion_id_fkey FOREIGN KEY (suscripcion_id) REFERENCES suscripciones(id)';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK pagos(suscripcion_id) -> suscripciones(id): %', SQLERRM;
    END;
  END IF;
END $$;

-- Invitaciones (clave para claim + trial)
DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('invitaciones') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE invitaciones (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        codigo VARCHAR(50) UNIQUE NOT NULL,
        plan_id INT NOT NULL REFERENCES planes(id),
        email_asignado VARCHAR(255),
        email VARCHAR(255),
        usado BOOLEAN DEFAULT false,
        fecha_uso TIMESTAMP,
        aseguradora_id %s,
        creado_por %s,
        expira_en TIMESTAMP NOT NULL,
        trial_days INT,
        pais VARCHAR(2),
        paises TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    $SQL$, usuarios_id_type, usuarios_id_type);
  END IF;

  IF to_regclass('invitaciones') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invitaciones_aseguradora_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE invitaciones ADD CONSTRAINT invitaciones_aseguradora_id_fkey FOREIGN KEY (aseguradora_id) REFERENCES usuarios(id)';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK invitaciones(aseguradora_id) -> usuarios(id): %', SQLERRM;
    END;
  END IF;

  IF to_regclass('invitaciones') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'invitaciones_creado_por_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE invitaciones ADD CONSTRAINT invitaciones_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuarios(id)';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK invitaciones(creado_por) -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

-- Asegurar columnas en DBs viejas
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS email_asignado VARCHAR(255);
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS usado BOOLEAN DEFAULT false;
ALTER TABLE invitaciones ADD COLUMN IF NOT EXISTS fecha_uso TIMESTAMP;
DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('invitaciones') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invitaciones' AND column_name = 'aseguradora_id'
    ) THEN
      EXECUTE format('ALTER TABLE invitaciones ADD COLUMN aseguradora_id %s', usuarios_id_type);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'invitaciones' AND column_name = 'creado_por'
    ) THEN
      EXECUTE format('ALTER TABLE invitaciones ADD COLUMN creado_por %s', usuarios_id_type);
    END IF;
  END IF;
END $$;

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
DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('auditoria') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE auditoria (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id %s,
        accion VARCHAR(255) NOT NULL,
        recurso VARCHAR(100),
        recurso_id VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        detalles JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    $SQL$, usuarios_id_type);
  END IF;

  IF to_regclass('auditoria') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auditoria_usuario_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE auditoria ADD CONSTRAINT auditoria_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id)';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK auditoria(usuario_id) -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

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
DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('api_tokens') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE api_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        aseguradora_id %s NOT NULL,
        token VARCHAR(255) UNIQUE NOT NULL,
        nombre VARCHAR(255),
        ultimo_uso TIMESTAMP,
        expira_en TIMESTAMP,
        activo BOOLEAN DEFAULT true,
        permisos TEXT[] DEFAULT ARRAY['read', 'write'],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    $SQL$, usuarios_id_type);
  END IF;

  IF to_regclass('api_tokens') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'api_tokens_aseguradora_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE api_tokens ADD CONSTRAINT api_tokens_aseguradora_id_fkey FOREIGN KEY (aseguradora_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK api_tokens -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

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

DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('dos_factores') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE dos_factores (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id %s NOT NULL UNIQUE,
        tipo VARCHAR(20) NOT NULL,
        contacto VARCHAR(255),
        codigo_actual VARCHAR(6),
        intentos_fallidos INT DEFAULT 0,
        bloqueado_hasta TIMESTAMP,
        habilitado BOOLEAN DEFAULT false,
        fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        ultima_verificacion TIMESTAMP
      )
    $SQL$, usuarios_id_type);
  END IF;

  IF to_regclass('dos_factores') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dos_factores_usuario_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE dos_factores ADD CONSTRAINT dos_factores_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK dos_factores -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

DO $$
DECLARE
  usuarios_id_type TEXT := COALESCE(current_setting('cogniseguros.usuarios_id_type', true), 'uuid');
BEGIN
  IF to_regclass('backup_codes') IS NULL THEN
    EXECUTE format($SQL$
      CREATE TABLE backup_codes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        usuario_id %s NOT NULL,
        codigo VARCHAR(20) UNIQUE NOT NULL,
        usado BOOLEAN DEFAULT false,
        fecha_uso TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    $SQL$, usuarios_id_type);
  END IF;

  IF to_regclass('backup_codes') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backup_codes_usuario_id_fkey'
  ) THEN
    BEGIN
      EXECUTE 'ALTER TABLE backup_codes ADD CONSTRAINT backup_codes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE';
    EXCEPTION
      WHEN others THEN
        RAISE NOTICE 'Skipping FK backup_codes -> usuarios(id): %', SQLERRM;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_dos_factores_usuario ON dos_factores(usuario_id);
CREATE INDEX IF NOT EXISTS idx_backup_codes_usuario ON backup_codes(usuario_id);

COMMIT;
