# Observabilidad (Sprint 7)

Objetivo: tener señales mínimas de salud y performance sin complicar el despliegue.

## Logs estructurados

El backend emite logs JSON por request con:
- `request_id` (también en header `x-request-id`)
- `method`, `path`, `status`, `ms`
- `auth_user_id` y `auth_role` (si hay JWT)
- `build_id`

No se loguea el body para evitar PII.

## Endpoints

- `GET /api/health` (ya existente)
- `GET /api/metrics` métricas básicas in-memory (útil para debug rápido)

## Versionado de API

Hay un alias estable:
- `/v1/*` -> `/api/*`

Esto permite consumir rutas versionadas sin duplicar handlers.

## Nota sobre alertas

Las alertas “técnicas” se implementan como logs estructurados + métricas. Si querés alertas reales (Slack/Discord/email), lo agregamos como opt-in con webhook en Sprint 8 para no introducir side-effects en prod sin control.
