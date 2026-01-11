# Campañas y Audiencias (Sprint 4)

Objetivo: segmentación (autos/vida) + trazabilidad de ejecuciones para medir impacto.

## Conceptos

- **Audience Definition**: define un segmento con un filtro JSON (DSL)
- **Audience Run**: ejecución de un segmento a una fecha (`as_of_date`) con snapshot del filtro y miembros persistidos
- **Campaign**: definición de campaña (canal, línea, presupuesto, etc.)
- **Campaign Run**: ejecución/"lanzamiento" de campaña sobre un audience run

## DSL de filtros (JSON)

Soporta:
- Leaf: `{ "field": "days_left", "op": "lte", "value": 30 }`
- `all`: AND
- `any`: OR
- `not`: NOT

Operadores: `eq`, `neq`, `contains`, `exists`, `empty`, `gt`, `gte`, `lt`, `lte`.

Features disponibles:
- `line` ("autos"|"vida") se infiere de `descripcion_seguro` (heurístico)
- `days_left` desde `fecha_fin_str` vs `as_of_date`
- `monto`, `cuota_paga`, `mail`, `pais`, etc.

## Endpoints

Autorización igual que scoring:
- Enterprise token (claim `enterprise:true`) → solo su tenant
- JWT aseguradora → solo su tenant
- Admin JWT → requiere `aseguradora_id`

Audiencias:
- `GET /api/audiences/definitions?aseguradora_id=...`
- `POST /api/audiences/definitions` body: `{ aseguradora_id?, key, name, description, filter }`
- `POST /api/audiences/run` body: `{ aseguradora_id?, definition_id?, filter?, as_of_date?, persist? }`
- `GET /api/audiences/runs?aseguradora_id=...&definition_id=...&limit=...`
- `GET /api/audiences/runs/:run_uuid/members?aseguradora_id=...&limit=...&offset=...`

Campañas:
- `GET /api/campaigns?aseguradora_id=...`
- `POST /api/campaigns` body: `{ aseguradora_id?, key?, name, line?, channel?, budget?, expected_value?, config? }`
- `POST /api/campaigns/:id/launch` body: `{ aseguradora_id?, audience_run_uuid }`

## Smoke test

- `AUTH_TOKEN=<token> node scripts/smoke-audiences.mjs <aseguradora_id> [baseUrl]`
