-- 2026-01-09
-- WhatsApp Inbox MVP: columnas/indices para estados + intent + metadata de mensajes
-- Idempotente: se puede ejecutar múltiples veces.

BEGIN;

-- Tablas base (si no existían)
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

-- Compat: DBs existentes pueden tener tablas sin estas columnas
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'PENDIENTE';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS intent TEXT DEFAULT 'general';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_inbound_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_outbound_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS last_actor TEXT DEFAULT 'cliente';
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS assigned_to TEXT;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS requires_template BOOLEAN DEFAULT FALSE;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS resolution_type TEXT;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS reopened_count INT DEFAULT 0;
ALTER TABLE whatsapp_conversations ADD COLUMN IF NOT EXISTS waba_phone_number_id TEXT;

CREATE INDEX IF NOT EXISTS ix_whatsapp_conversations_status_last_inbound ON whatsapp_conversations(status, last_inbound_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_whatsapp_conversations_intent_last_inbound ON whatsapp_conversations(intent, last_inbound_at DESC NULLS LAST);

ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS actor TEXT DEFAULT 'cliente';
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'text';
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS content_meta JSONB;
ALTER TABLE whatsapp_messages ADD COLUMN IF NOT EXISTS delivery_status TEXT;
CREATE INDEX IF NOT EXISTS ix_whatsapp_messages_conversation_created_at_desc ON whatsapp_messages(conversation_id, created_at DESC);

-- Backfill defaults (por si existía la columna pero con NULL / vacío)
UPDATE whatsapp_conversations
SET status = 'PENDIENTE'
WHERE status IS NULL OR TRIM(status) = '';

UPDATE whatsapp_conversations
SET intent = 'general'
WHERE intent IS NULL OR TRIM(intent) = '';

UPDATE whatsapp_conversations
SET last_actor = 'cliente'
WHERE last_actor IS NULL OR TRIM(last_actor) = '';

UPDATE whatsapp_conversations
SET opened_at = COALESCE(opened_at, created_at, NOW())
WHERE opened_at IS NULL;

UPDATE whatsapp_messages
SET actor = 'cliente'
WHERE actor IS NULL OR TRIM(actor) = '';

UPDATE whatsapp_messages
SET type = 'text'
WHERE type IS NULL OR TRIM(type) = '';

COMMIT;
