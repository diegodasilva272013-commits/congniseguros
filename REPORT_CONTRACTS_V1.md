# Report Contracts v1 (Sprint 2)

Objetivo: contratos estables y auditables para que el backend entregue JSON determinista y el AutoGPT Orchestrator consuma resultados **sin ejecutar acciones**.

## Convenciones
- Todas las respuestas incluyen `contract_version: "v1"`.
- `aseguradora_id` es requerido (multi-tenant: resuelve tenant DB).
- `pais`/`paises` se filtran por lo permitido para la aseguradora.
- Formato:
  - Por defecto: JSON
  - CSV: `?format=csv`

## Auth / Seguridad
- En **producción**, los endpoints de reportes aceptan:
  - `Authorization: Bearer <JWT>` del usuario dueño (o rol `admin`), **o**
  - `x-automation-key: <AUTOMATION_API_KEY>` (para orquestaciones/automatizaciones).
- Si `AUTOMATION_API_KEY` no está configurada en prod, el acceso por automation key se rechaza (fail-closed).

---

## 1) Financial Monthly Summary
**Endpoint:** `POST /api/reports/financial/monthly?format=csv|json`

**Input (JSON):**
```json
{
  "aseguradora_id": "<uuid|number>",
  "from": "2025-01-01T00:00:00.000Z",
  "to": "2026-01-01T00:00:00.000Z"
}
```
- `from/to` opcionales. Default: últimos 12 meses.

**Output (JSON):**
```json
{
  "status": "success",
  "contract_version": "v1",
  "from": "...",
  "to": "...",
  "rows": [
    {
      "month": "2026-01",
      "clientes": 10,
      "monto_total": 12345.67,
      "clientes_cuota_si": 7,
      "monto_cobrado": 8901.23
    }
  ]
}
```

---

## 2) Portfolio By Line + Payment Status
**Endpoint:** `POST /api/reports/portfolio/line-status?format=csv|json`

**Input (JSON):**
```json
{
  "aseguradora_id": "<uuid|number>",
  "from": "2025-01-01T00:00:00.000Z",
  "to": "2026-01-01T00:00:00.000Z"
}
```

**Output (JSON):**
```json
{
  "status": "success",
  "contract_version": "v1",
  "rows": [
    {
      "linea": "AUTO|VIDA|OTRO",
      "cuota_paga": "SI|NO|",
      "clientes": 5,
      "monto_total": 2500.00
    }
  ]
}
```

---

## 3) Expirations (Next N days)
**Endpoint:** `POST /api/reports/portfolio/expirations?format=csv|json`

**Input (JSON):**
```json
{
  "aseguradora_id": "<uuid|number>",
  "days": 30
}
```
- `days` opcional (default 30, max 365).

**Output (JSON):**
```json
{
  "status": "success",
  "contract_version": "v1",
  "days": 30,
  "rows": [
    {
      "id": 123,
      "pais": "AR",
      "nombre": "...",
      "apellido": "...",
      "documento": "...",
      "telefono": "...",
      "mail": "...",
      "fecha_fin": "2026-01-20",
      "days_left": 10,
      "monto": 100.00,
      "cuota_paga": "NO",
      "descripcion_seguro": "...",
      "polizas": "..."
    }
  ]
}
```

Nota: `fecha_fin` solo se calcula cuando `fecha_fin_str` es ISO (`YYYY-MM-DD...`).

---

## 4) Clients Revenue Ranking (Top/Bottom)
**Endpoint:** `POST /api/reports/portfolio/clients-revenue?order=desc|asc&limit=20&format=csv|json`

Ordena clientes por ingresos estimados en el rango `from/to`.
- `order=desc` (default) → “top clientes”
- `order=asc` → “clientes con menos ingresos”
- `limit` opcional (default 20, max 200)

**Input (JSON):**
```json
{
  "aseguradora_id": "<uuid|number>",
  "from": "2025-01-01T00:00:00.000Z",
  "to": "2026-01-01T00:00:00.000Z"
}
```

**Output (JSON):**
```json
{
  "status": "success",
  "contract_version": "v1",
  "from": "...",
  "to": "...",
  "order": "desc",
  "limit": 20,
  "rows": [
    {
      "id": 123,
      "pais": "AR",
      "nombre": "...",
      "apellido": "...",
      "documento": "...",
      "telefono": "...",
      "mail": "...",
      "linea": "AUTO|VIDA|OTRO",
      "items": 1,
      "monto_total": 1234.56,
      "monto_cobrado": 800.00
    }
  ]
}
```
