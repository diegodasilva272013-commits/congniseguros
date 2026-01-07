-- Schema PostgreSQL para SegurosPro

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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE TABLE IF NOT EXISTS perfil_aseguradora (
  aseguradora_id UUID PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre_comercial VARCHAR(255),
  telefono VARCHAR(20),
  email VARCHAR(255),
  direccion TEXT,
  horarios TEXT,
  logo_dataurl LONGTEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para optimización
CREATE INDEX idx_clientes_aseguradora ON clientes(aseguradora_id);
CREATE INDEX idx_clientes_documento ON clientes(documento);
CREATE INDEX idx_config_scope ON configuracion(scope, scope_id);
CREATE INDEX idx_usuarios_email ON usuarios(email);
