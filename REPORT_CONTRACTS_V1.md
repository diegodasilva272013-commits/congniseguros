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

---

## 5) Client Contribution (Monthly + Annual)
**Endpoint:** `POST /api/reports/portfolio/client-contribution?order=desc|asc&limit=30&paid_only=0|1&format=csv|json`

Reporte “contable” **estimado** basado en la cartera actual:
- `ingreso_mensual` se calcula desde `clientes.monto` (asumido como ingreso mensual por cliente).
- `ingreso_anual = ingreso_mensual * 12`.
- `%_cartera` se calcula contra el total del período (mensual/anual).

Notas importantes:
- Si querés contabilidad 100% real (ingresos por fecha), hace falta una tabla de **movimientos/pagos de clientes** (ledger). Este reporte es una proyección útil para gestión.

**Query params:**
- `order=desc` (default) → mejores clientes
- `order=asc` → clientes más chicos
- `limit` opcional (default 30, max 200)
- `paid_only=1` para considerar solo clientes con `cuota_paga=SI`

**Input (JSON):**
```json
{
  "aseguradora_id": "<uuid|number>",
  "from": "2025-01-01T00:00:00.000Z",
  "to": "2026-01-01T00:00:00.000Z",
  "include_all": true
}
```
- `include_all` (default true): ignora `from/to` y calcula sobre la cartera completa.
- Si `include_all=false`, filtra por `fecha_alta` dentro de `from/to` (útil para snapshots históricos).

**Output (JSON):**
```json
{
  "status": "success",
  "contract_version": "v1",
  "from": "...",
  "to": "...",
  "include_all": true,
  "order": "desc",
  "limit": 30,
  "paid_only": false,
  "totals": {
    "ingreso_mensual_total": 12345.67,
    "ingreso_anual_total": 148148.04,
    "ingreso_mensual_cobrado": 9000.00,
    "ingreso_anual_cobrado": 108000.00
  },
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
      "cuota_paga": "SI|NO|",
      "ingreso_mensual": 100.00,
      "ingreso_anual": 1200.00,
      "ingreso_mensual_cobrado": 100.00,
      "ingreso_anual_cobrado": 1200.00,
      "pct_cartera_mensual": 0.81,
      "pct_cartera_anual": 0.81
    }
  ]
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
