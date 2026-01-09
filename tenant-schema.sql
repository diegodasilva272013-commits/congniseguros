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
