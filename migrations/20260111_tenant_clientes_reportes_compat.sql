-- Tenant: compat schema for reports on legacy DBs
-- Date: 2026-01-11
-- scope: tenant

BEGIN;

-- Asegurar columnas usadas por reportes (idempotente)
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS pais VARCHAR(2) DEFAULT 'AR';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS fecha_alta TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS nombre VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS apellido VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS mail VARCHAR(255);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS documento VARCHAR(20);
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS polizas TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS descripcion_seguro TEXT;
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS cuota_paga VARCHAR(10) DEFAULT 'NO';
ALTER TABLE clientes ADD COLUMN IF NOT EXISTS monto DECIMAL(10, 2);

-- Defaults seguros
UPDATE clientes SET pais = 'AR' WHERE pais IS NULL OR TRIM(pais) = '';
UPDATE clientes SET cuota_paga = 'NO' WHERE cuota_paga IS NULL OR TRIM(cuota_paga) = '';

-- Índice único (legacy podía tener ux_clientes_documento)
DROP INDEX IF EXISTS ux_clientes_documento;
CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_pais_documento ON clientes(pais, documento);

COMMIT;
