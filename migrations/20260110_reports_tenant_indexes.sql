-- 2026-01-10
-- scope: tenant
-- Índices para reportes (cartera / financieros) sobre tabla clientes
-- Idempotente.

BEGIN;

-- filtros típicos: pais + fecha_alta
CREATE INDEX IF NOT EXISTS ix_clientes_pais_fecha_alta ON clientes(pais, fecha_alta DESC);

-- segmentación rápida por estado de cuota
CREATE INDEX IF NOT EXISTS ix_clientes_pais_cuota_paga ON clientes(pais, cuota_paga);

-- búsquedas por documento (ya existe unique pais+documento)
-- búsqueda por vencimiento (string): solo útil para LIKE/regex; preferimos parse en query
CREATE INDEX IF NOT EXISTS ix_clientes_pais_fecha_fin_str ON clientes(pais, fecha_fin_str);

COMMIT;
