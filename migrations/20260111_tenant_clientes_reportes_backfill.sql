-- Tenant: backfill for legacy data so reports return rows
-- Date: 2026-01-11
-- scope: tenant

BEGIN;

-- Asegurar columnas base (si ya existen, no hace nada)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuota_paga VARCHAR(10) DEFAULT 'NO';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR';

-- Backfills para data existente (si venía de schema viejo)
UPDATE clientes SET updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP) WHERE updated_at IS NULL;
UPDATE clientes SET fecha_alta = COALESCE(fecha_alta, updated_at, CURRENT_TIMESTAMP) WHERE fecha_alta IS NULL;
UPDATE clientes SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = '';
UPDATE clientes SET cuota_paga = 'NO' WHERE cuota_paga IS NULL OR TRIM(cuota_paga) = '';

COMMIT;
