# 🔐 Sistema de Membresía y Seguridad

## ✨ Qué incluye

1. **Planes de pago** (FREE, STARTER, PROFESSIONAL, ENTERPRISE)
2. **Sistema de invitaciones** (no hay registro público)
3. **Control de acceso por membresía**
4. **Auditoría completa** (quién hizo qué y cuándo)
5. **API tokens** (para integraciones seguras)
6. **Panel Admin** (gestionar aseguradoras y suscripciones)

## 🎯 Flujo de acceso

```
1. ADMIN crea INVITACIÓN con plan
   ↓
2. ADMIN envía CÓDIGO a aseguradora
   ↓
3. ASEGURADORA registra con CÓDIGO
   ↓
4. Sistema crea SUSCRIPCIÓN automática
   ↓
5. ASEGURADORA puede usar app según plan
   ↓
6. Si membresía vence → ACCESO BLOQUEADO
```

## 📝 Instalación

### 1. Crear tablas de seguridad

```bash
psql -U postgres -d cogniseguros -f schema_seguridad.sql
```

Esto crea:
- `planes` - Tipos de membresía
- `suscripciones` - Acceso de cada aseguradora
- `pagos` - Historial de transacciones
- `invitaciones` - Códigos de registro
- `auditoría` - Log de todas las acciones
- `api_tokens` - Para API REST

### 2. Datos de planes incluidos

```
- FREE: 0$ | 10 clientes | SIN WhatsApp, IA, API
- STARTER: $99/mes | 100 clientes | CON WhatsApp
- PROFESSIONAL: $299/mes | 1000 clientes | CON WhatsApp + IA + API
- ENTERPRISE: $999/mes | Ilimitado | Todo incluido
```

## 🛠️ Panel Admin

### Crear invitaciones

```bash
curl -X POST http://localhost:5000/api/admin/invitaciones/crear \
  -H "Content-Type: application/json" \
  -d '{
    "admin_token": "tu_admin_key",
    "plan_id": 2,
    "email": "aseguradora@ejemplo.com",
    "cantidad": 1,
    "dias_expiracion": 30
  }'

# Response:
{
  "status": "success",
  "data": [{
    "id": "xxx",
    "codigo": "A1B2C3D4E5F6",
    "email_asignado": "aseguradora@ejemplo.com",
    "expira_en": "2026-02-03"
  }]
}
```

### Listar invitaciones

```bash
curl -X POST http://localhost:5000/api/admin/invitaciones/listar \
  -H "Content-Type: application/json" \
  -d '{
    "admin_token": "tu_admin_key",
    "usado": false
  }'
```

### Gestionar suscripciones

```bash
# Listar todas
curl -X POST http://localhost:5000/api/admin/suscripciones/listar \
  -H "Content-Type: application/json" \
  -d '{"admin_token": "tu_admin_key"}'

# Cambiar plan
curl -X POST http://localhost:5000/api/admin/suscripciones/cambiar-plan \
  -H "Content-Type: application/json" \
  -d '{
    "admin_token": "tu_admin_key",
    "aseguradora_id": "uuid",
    "plan_id_nuevo": 3
  }'

# Cancelar suscripción
curl -X POST http://localhost:5000/api/admin/suscripciones/cancelar \
  -H "Content-Type: application/json" \
  -d '{
    "admin_token": "tu_admin_key",
    "aseguradora_id": "uuid",
    "motivo": "cancelado por cliente"
  }'
```

## 👤 Flujo de registro de aseguradora

### 1. Aseguradora recibe invitación

```
Email: "Bienvenida a SegurosPro!
Tu código: A1B2C3D4E5F6
Válido hasta: 2026-02-03"
```

### 2. Aseguradora se registra

```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "codigo_invitacion": "A1B2C3D4E5F6",
    "password": "MiContraseñaSegura123",
    "nombre": "MiAseguradora SA"
  }'

# Response:
{
  "status": "success",
  "user": {
    "id": "uuid",
    "nombre": "MiAseguradora SA",
    "email": "aseguradora@ejemplo.com"
  },
  "message": "Registro exitoso. Bienvenido!"
}
```

### 3. Sistema crea automáticamente

- ✅ Usuario
- ✅ Suscripción (con plan del código)
- ✅ Entrada de auditoría
- ✅ Marca invitación como usada

## 🔒 Validaciones en cada endpoint

Todos los endpoints de la app (clientes, WhatsApp, IA) validan:

```javascript
// Middleware: checkMembership
1. ¿Usuario existe?
2. ¿Tiene suscripción ACTIVA?
3. ¿Suscripción no expirada?
4. Si no → BLOQUEAR acceso
```

Si falta membresía:
```json
{
  "status": "error",
  "message": "Membresía no activa o vencida. Contactá a soporte."
}
```

## ⚡ Restricciones por plan

```javascript
// checkFeature('whatsapp') - Verifica si plan tiene WhatsApp
// checkFeature('openai') - Verifica si plan tiene IA
// checkFeature('api') - Verifica si plan tiene API REST

// Ejemplo:
app.post("/api/whatsapp/send", checkMembership, checkFeature('whatsapp'), (req, res) => {
  // Solo aseguradoras con plan STARTER+ pueden acceder
});
```

## 📊 Auditoría

Todas las acciones se registran:

```sql
SELECT * FROM auditoría WHERE usuario_id = 'xxx' ORDER BY created_at DESC;

-- Columns:
-- id, usuario_id, accion, recurso, detalles, created_at
-- Ejemplo: REGISTRO_EXITOSO, SUSCRIPCION_CANCELADA, PLAN_ACTUALIZADO
```

## 💳 Integración con pagos (próximo paso)

Pueden integrar:
- ✅ Stripe (tarjeta de crédito)
- ✅ MercadoPago (América Latina)
- ✅ Transferencias bancarias

En tabla `pagos` se guarda:
- `estado`: PENDIENTE, COMPLETADO, FALLIDO
- `metodo_pago`: stripe, mercadopago, transferencia
- `referencia_externa`: payment_id de terceros

## 🚀 Deploy seguro

Para producción, cambiar:

```env
# .env
ADMIN_KEY=algo_muy_secreto_y_largo_xyz123
DB_PASSWORD=contraseña_segura_basedatos
API_KEY_OPEN=sk-xxxxx

# Compatibilidad (opcional):
# OPENAI_API_KEY=sk-xxxxx
WHATSAPP_ACCESS_TOKEN=xxxxx

# En código:
- Agregar JWT para autenticación
- Rate limiting en endpoints
- HTTPS obligatorio
- Validar CORS contra dominio específico
```

## 📞 Contacto y soporte

Si aseguradora tiene membresía vencida:
- Email automático con 30 días antes
- Portal para renovar
- Bloqueador suave (mostrar banner, no bloquear acceso completamente)

---

¿Preguntas? Contactanos en soporte@cogniseguros.com
