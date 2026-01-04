-- Tabla para 2FA

CREATE TABLE IF NOT EXISTS dos_factores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL, -- 'email', 'sms'
  contacto VARCHAR(255), -- email o teléfono
  codigo_actual VARCHAR(6),
  intentos_fallidos INT DEFAULT 0,
  bloqueado_hasta TIMESTAMP,
  habilitado BOOLEAN DEFAULT false,
  fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ultima_verificacion TIMESTAMP
);

-- Tabla para backup codes (en caso que pierda acceso a 2FA)
CREATE TABLE IF NOT EXISTS backup_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo VARCHAR(20) UNIQUE NOT NULL,
  usado BOOLEAN DEFAULT false,
  fecha_uso TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_dos_factores_usuario ON dos_factores(usuario_id);
CREATE INDEX idx_backup_codes_usuario ON backup_codes(usuario_id);
