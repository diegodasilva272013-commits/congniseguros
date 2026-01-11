# Notificaciones (Sprint 5)

Objetivo: motor de notificaciones **auditable y confiable** (triggers + rate limit + logs + retries) sin spamear.

## Modelo (tenant DB)

- `notification_templates`: templates por canal (WhatsApp/email/etc)
- `notification_triggers`: reglas/condiciones para disparar
- `notification_throttles`: rate-limit por `trigger_key + cliente_id`
- `notification_jobs`: cola con reintentos (QUEUED/RETRY/SENDING/SENT/FAILED)
- `notification_deliveries`: log por intento (provider response)

## DSL de triggers

`notification_triggers.filter` usa el mismo estilo JSON que audiencias:
- Leaf: `{ "field": "days_left", "op": "lte", "value": 15 }`
- `all`/`any`/`not`

Features actuales (por cliente):
- `telefono`, `mail`, `cuota_paga`, `monto`, `days_left` (desde `fecha_fin_str`)

## Endpoints

- `GET /api/notifications/templates?aseguradora_id=...`
- `POST /api/notifications/templates`
- `GET /api/notifications/triggers?aseguradora_id=...`
- `POST /api/notifications/triggers`
- `POST /api/notifications/detect-enqueue` body: `{ aseguradora_id?, trigger_key?, as_of_date?, dry_run?, max? }`
- `POST /api/notifications/process` body: `{ aseguradora_id?, max_jobs?, dry_run? }`
- `GET /api/notifications/jobs?aseguradora_id=...&status=...&limit=...`

## Seguridad / "No romper"

- Todo es **opt-in**: sólo se ejecuta si llamás a los endpoints.
- Rate limit evita spam por trigger/cliente.
- Retries controlados por trigger (`max_retries`, `retry_backoff_sec`).

## Smoke test

- `AUTH_TOKEN=<token> node scripts/smoke-notifications.mjs <aseguradora_id> [baseUrl]`
