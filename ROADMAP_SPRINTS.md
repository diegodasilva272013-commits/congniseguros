# Roadmap por Sprints (Enterprise)

Estado actualizado: 2026-01-11

## Sprint 0 — Fundación
- [x] Dockerfile + docker-compose + healthchecks
- [x] EasyPanel deploy guide
- [x] Entornos/secrets
- DoD: deploy funcional + healthcheck OK

## Sprint 1 — Modelo Postgres
- [x] Migraciones versionadas (`migrate.js`) + checksums + baseline
- [x] Soporte multi-scope master/tenant
- DoD: migraciones idempotentes

## Sprint 2 — Contratos de Reportes
- [x] Contratos v1 + endpoints JSON/CSV
- [x] Smoke test `scripts/smoke-reports.mjs`
- DoD: contratos estables

## Sprint 3 — Motor de Scoring
- [x] Tablas tenant + historial + explainability (`scoring_*`)
- [x] Endpoints de scoring + gestión de rule-sets
- [x] Default rule-set inicial (editable)
- DoD: scoring reproducible y auditable

## Sprint 4 — Campañas y Audiencias
- [x] Modelo de audiencias (segmentación autos/vida)
- [x] Persistencia de ejecuciones (auditable) + miembros
- [x] Modelo de campañas + launches (trazabilidad)
- [x] Estimación básica de impacto (sumatoria monto)
- DoD: audiencias trazables y medibles (MVP)

## Sprint 5 — Notificaciones
- [x] Triggers inteligentes + rate limit
- [x] Logs + retries
- DoD: cero spam

## Sprint 6 — AutoGPT Orchestrator
- [x] Interface JSON formal (inputs/outputs)
- [x] Análisis de reportes/scoring/campañas (audit-only)
- [x] Prompts marketing + resúmenes ejecutivos
- DoD: outputs versionados en `autogpt_runs`

## Sprint 7 — API y Observabilidad
- [x] Rutas `/v1` estables
- [x] Logs estructurados y métricas
- [x] Alertas técnicas
- DoD: monitoreo completo

## Sprint 8 — Hardening y Producción
- [ ] Seguridad (headers, rate limit, CSP)
- [ ] Backups Postgres + restore drills
- [ ] Rollback / runbook
- DoD: producción estable
