# Motor de Scoring (Sprint 3)

Objetivo: scoring **reproducible, auditable y explicable** por cliente, usando reglas configurables guardadas en PostgreSQL (tenant DB).

## Esquema (tenant DB)

Tablas:
- `scoring_rule_sets`: versiones de rule-sets (config + activación)
- `scoring_rules`: reglas de un rule-set (condición + puntos)
- `scoring_runs`: ejecuciones históricas (snapshot + score + banda)
- `scoring_run_items`: explainability por regla (matched/points/details)

## DSL de condiciones (JSON)

Un `condition` es un JSON que soporta:
- Leaf: `{ "field": "monto", "op": "gte", "value": 100000 }`
- `all`: `{ "all": [ ... ] }` (AND)
- `any`: `{ "any": [ ... ] }` (OR)
- `not`: `{ "not": { ... } }`

Operadores (`op`):
- texto: `eq`, `neq`, `contains`, `exists`, `empty`
- numérico: `gt`, `gte`, `lt`, `lte`

Campos disponibles (features actuales):
- `monto` (number)
- `cuota_paga` (string)
- `mail` (string)
- `pais` (string)
- `fecha_fin` (YYYY-MM-DD)
- `days_left` (int, calculado con `as_of_date`)

## Endpoints

Autorización:
- **Enterprise**: token obtenido por `/enterprise/*` (claim `enterprise:true`) → solo su tenant.
- **Admin JWT** (rol=admin) → puede operar por `aseguradora_id`.

Endpoints:
- `GET /api/scoring/rule-sets?aseguradora_id=...`
- `GET /api/scoring/rule-sets/:id?aseguradora_id=...`
- `POST /api/scoring/rule-sets` (crear nueva versión) body: `{ aseguradora_id?, key, name, description, config, rules, activate }`
- `POST /api/scoring/rule-sets/:id/activate`
- `POST /api/scoring/score` body: `{ aseguradora_id?, cliente_id, as_of_date?, rule_set_id?, persist? }`
- `GET /api/scoring/runs?aseguradora_id=...&cliente_id=...&limit=...`
- `GET /api/scoring/runs/:run_uuid?aseguradora_id=...`

## Smoke test

- `AUTH_TOKEN=<token> node scripts/smoke-scoring.mjs <aseguradora_id> <cliente_id> [baseUrl]`
