# Migraciones (Sprint 1)

## Objetivo
Tener migraciones SQL versionadas, idempotentes y auditables.

## Convención
- Archivos en `/migrations` con nombre: `YYYYMMDD_descripcion.sql`
- Encabezado obligatorio:
  - `-- scope: master` o `-- scope: tenant` o `-- scope: both`
- **Idempotencia**: usar `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`.

## Runner
`npm run migrate`
- Aplica migraciones `scope: master` en la DB master.
- Crea/usa tabla `schema_migrations` para registrar `filename`, `checksum`, `applied_at`, `applied_by`, `execution_ms`.

Opciones:
- `npm run migrate -- --dry-run`
- `npm run migrate -- --baseline`
- `npm run migrate -- --tenants` (aplica `scope: tenant` en DBs de tenants detectadas desde `usuarios.tenant_db`)

## Notas de transacciones
- Si el SQL ya contiene `BEGIN;`/`COMMIT;`, el runner NO envuelve la migración en otra transacción.
- Recomendación: mantener migraciones simples y rápidas; evitar `CREATE INDEX CONCURRENTLY` en estas migraciones.

## Producción (EasyPanel)
- En prod, correr migraciones como job controlado (no en cada arranque).
- Mantener `RUN_DB_SETUP=0` y `RUN_MIGRATIONS=0` por defecto.

## Migraciones recientes
- Tenant scoring engine: `migrations/20260111_tenant_scoring_engine.sql`
- Tenant campaigns/audiences: `migrations/20260111_tenant_campaigns_audiences.sql`
- Tenant notifications (MVP): `migrations/20260111_tenant_notifications_mvp.sql`
