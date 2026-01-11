# AutoGPT Orchestrator (Sprint 6) — Audit-only

Este módulo NO ejecuta acciones con side effects (no envía WhatsApp, no cambia campañas, no escribe en tenants). Solo analiza y persiste outputs en `autogpt_runs` (DB master).

## Endpoint

- `POST /api/autogpt/analyze`

Acceso:
- En producción: requiere `x-automation-key` (mismo esquema que `/api/autogpt/runs`).
- En dev: también se puede usar JWT admin.

Body:
```json
{
  "aseguradora_id": 123,
  "as_of_date": "2026-01-11",
  "max_items": 10
}
```

Respuesta:
- `run_uuid` (si pudo persistir)
- `output`: resumen KPI + snapshots + recomendaciones

## Auditoría

Cada ejecución guarda:
- `inputs`: parámetros y modo de acceso
- `outputs`: el análisis completo
- `decisions`: siempre `{"actions":"none"}`

## Nota

Si falla la persistencia por algún motivo, igualmente devuelve `output` (pero `run_uuid=null`).
