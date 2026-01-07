-- Extensión de Schema para Membresía y Seguridad

-- ===== PLANES =====
CREATE TABLE IF NOT EXISTS planes (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL UNIQUE,
  descripcion TEXT,
  precio_mensual DECIMAL(10, 2) NOT NULL,
  precio_anual DECIMAL(10, 2),
  limite_clientes INT DEFAULT -1, -- -1 = ilimitado
  limite_usuarios INT DEFAULT 1,
  soporta_whatsapp BOOLEAN DEFAULT false,
  soporta_openai BOOLEAN DEFAULT false,
  soporta_api_rest BOOLEAN DEFAULT false,
  orden INT DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== SUSCRIPCIONES =====
CREATE TABLE IF NOT EXISTS suscripciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguradora_id UUID NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  plan_id INT NOT NULL REFERENCES planes(id),
  estado VARCHAR(50) DEFAULT 'ACTIVA', -- ACTIVA, PAUSADA, CANCELADA, VENCIDA
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

-- ===== PAGOS / TRANSACCIONES =====
CREATE TABLE IF NOT EXISTS pagos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aseguradora_id UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  suscripcion_id UUID REFERENCES suscripciones(id),
  monto DECIMAL(10, 2) NOT NULL,
  moneda VARCHAR(3) DEFAULT 'USD',
  concepto VARCHAR(255), -- "Suscripción mensual", "Upgrade", etc
  estado VARCHAR(50) DEFAULT 'PENDIENTE', -- PENDIENTE, COMPLETADO, FALLIDO, REEMBOLSADO
  metodo_pago VARCHAR(50), -- 'stripe', 'mercadopago', 'transferencia'
  referencia_externa VARCHAR(255), -- payment_intent_id, preference_id, etc
  comprobante_url TEXT,
  fecha_pago TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== INVITACIONES (para registro de aseguradoras) =====
CREATE TABLE IF NOT EXISTS invitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  plan_id INT NOT NULL REFERENCES planes(id),
  email_asignado VARCHAR(255),
  email VARCHAR(255),
  usado BOOLEAN DEFAULT false,
  fecha_uso TIMESTAMP,
  aseguradora_id UUID REFERENCES usuarios(id),
  creado_por UUID REFERENCES usuarios(id), -- Admin que creó la invitación
  expira_en TIMESTAMP NOT NULL,
  trial_days INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== AUDITORÍA =====
CREATE TABLE IF NOT EXISTS auditoría (
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

-- ===== TOKENS DE ACCESO (para API) =====
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

-- ===== ÍNDICES =====
CREATE INDEX idx_suscripciones_aseguradora ON suscripciones(aseguradora_id);
CREATE INDEX idx_suscripciones_estado ON suscripciones(estado);
CREATE INDEX idx_pagos_aseguradora ON pagos(aseguradora_id);
CREATE INDEX idx_pagos_estado ON pagos(estado);
CREATE INDEX idx_invitaciones_codigo ON invitaciones(codigo);
CREATE INDEX idx_invitaciones_usado ON invitaciones(usado);
CREATE INDEX idx_auditoria_usuario ON auditoría(usuario_id);
CREATE INDEX idx_api_tokens_aseguradora ON api_tokens(aseguradora_id);

-- ===== DATOS INICIALES: PLANES =====
INSERT INTO planes (nombre, descripcion, precio_mensual, precio_anual, limite_clientes, limite_usuarios, soporta_whatsapp, soporta_openai, soporta_api_rest, orden, activo)
VALUES 
  ('FREE', 'Plan de prueba', 0, 0, 10, 1, false, false, false, 1, true),
  ('STARTER', 'Para pequeñas aseguradoras', 99, 990, 100, 2, true, false, false, 2, true),
  ('PROFESSIONAL', 'Para medianas aseguradoras', 299, 2990, 1000, 5, true, true, true, 3, true),
  ('ENTERPRISE', 'Solución personalizada', 999, NULL, -1, -1, true, true, true, 4, true)
ON CONFLICT (nombre) DO NOTHING;
