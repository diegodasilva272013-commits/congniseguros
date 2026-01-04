# SegurosPro - Guía Rápida de Nuevas Funcionalidades

## 🔐 2FA + Admin Dashboard Implementado

### Componentes Creados

```
src/components/
├── LoginWith2FA.jsx          (220 líneas - Login seguro con 2FA)
├── TwoFASetup.jsx            (200 líneas - Configuración de 2FA)
└── AdminDashboard.jsx        (600 líneas - Panel administrativo)
```

### Backend - Nuevos Endpoints

Todos requieren `Authorization: Bearer <token>` y verifican `rol='admin'`:

```
GET  /api/admin/invitaciones/listar        → Listar códigos de invitación
POST /api/admin/invitaciones/crear         → Crear nuevas invitaciones  
POST /api/admin/invitaciones/eliminar      → Eliminar invitación

GET  /api/admin/suscripciones/listar       → Listar todas las suscripciones
POST /api/admin/suscripciones/cambiar-plan → Cambiar plan de usuario
POST /api/admin/suscripciones/cancelar     → Cancelar suscripción

GET  /api/admin/pagos/listar               → Ver historial de pagos

GET  /api/admin/planes/listar              → Ver planes y estadísticas

GET  /api/admin/auditoria/listar           → Registro de auditoría (500 últimos)
```

### Flujo de Autenticación 2FA

```
Usuario escriba Email + Password
           ↓
[POST /api/auth/login]
           ↓
¿2FA habilitado?
    ├─ NO  → Retorna token + user directamente
    └─ SÍ  → Retorna session_token + "2fa_required"
             Usuario ingresa código (email o SMS)
             ↓
          [POST /api/auth/verify-2fa]
             ↓
          Código válido? 
          ├─ SÍ  → Retorna token + user
          └─ NO  → 5 intentos = lockout 15min
```

### Base de Datos - Tablas Nuevas

```sql
-- 2FA
CREATE TABLE dos_factores (
  id SERIAL PRIMARY KEY,
  usuario_id INT UNIQUE,
  tipo VARCHAR (20),      -- 'email' o 'sms'
  codigo_actual VARCHAR(10),
  intentos_fallidos INT,
  bloqueado_hasta TIMESTAMP,
  habilitado BOOLEAN,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE backup_codes (
  id SERIAL PRIMARY KEY,
  usuario_id INT,
  codigo VARCHAR(20),
  usado BOOLEAN,
  created_at TIMESTAMP
);
```

### Variables de Entorno Necesarias

```env
# Estos ya existen, pero verificar que estén presentes:
JWT_SECRET=clave_muy_secreta_cambiar_en_produccion
DB_HOST=localhost
DB_NAME=seguros_db
DB_USER=postgres
DB_PASSWORD=tu_password

# Para Email (opcional - ahora imprime en consola)
SENDGRID_API_KEY=

# Para SMS (opcional - ahora imprime en consola)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE=
```

### Uso en App.jsx

**Opción 1: Reemplazar login completo**
```jsx
import LoginWith2FA from './components/LoginWith2FA';

// En la sección de autenticación:
<LoginWith2FA onLoginSuccess={(user) => {
  setUser(user);
  setMode("dashboard");
  setMenu("cartera");
}} />
```

**Opción 2: Agregar 2FA en settings**
```jsx
import TwoFASetup from './components/TwoFASetup';

{/* En Settings → Seguridad */}
<button onClick={() => setShow2FASetu(true)}>
  🔐 Configurar 2FA
</button>

{show2FASetup && (
  <TwoFASetup userId={user.id} onSuccess={() => {
    setShow2FASetup(false);
    setUser({...user, 2fa_enabled: true});
  }} />
)}
```

**Opción 3: Mostrar Admin Dashboard**
```jsx
import AdminDashboard from './components/AdminDashboard';

// En el menú principal:
{user?.rol === 'admin' && (
  <button onClick={() => setMenu("admin")}>
    👨‍💼 Admin Dashboard
  </button>
)}

// En la vista:
{menu === "admin" && <AdminDashboard />}
```

### Estados de las Invitaciones

```
PENDIENTE
   ↓ (Usuario usa código)
USADA
   ↓ (Suscripción activa hasta fecha_fin)
VENCIDA (si pasan 30 días sin usar)
```

### Flujo de Planes

```
Usuario invitado con plan
   ↓
[POST /api/auth/register] - Con código de invitación
   ↓
Crea suscripción con ese plan
   ↓
Admin puede:
   ├─ Ver suscripción activa
   ├─ Cambiar plan a otro (ej: FREE → PROFESSIONAL)
   └─ Cancelar suscripción (cambia estado a 'cancelada')
```

### Auditoría - Acciones Registradas

Toda acción se registra en tabla `auditoria`:

```
usuario_id | accion               | recurso       | timestamp
-----------|----------------------|---------------|----------
1          | LOGIN_EXITOSO        | usuarios      | 2024-01-15...
1          | CLIENTE_CREADO       | clientes      | 2024-01-15...
2          | PLAN_CAMBIADO        | suscripciones | 2024-01-15...
2          | SUSCRIPCION_CANCELADA| suscripciones | 2024-01-15...
2          | INVITACION_ELIMINADA | invitaciones  | 2024-01-15...
```

### Límites de Seguridad

```
2FA Código: 6 dígitos, válido por 15 minutos
Intentos: 5 intentos fallidos = 15 min lockout
Backup codes: 10 códigos, un único uso cada uno
Invitación: Válida por 30 días
Sesión: Token JWT con expiración (revisar backend)
```

### Monitoreo

Ver último evento:
```bash
# Terminal - conectarse a DB
psql -U postgres -d seguros_db -c \
  "SELECT * FROM auditoria ORDER BY timestamp DESC LIMIT 5;"
```

Ver 2FA activo:
```bash
psql -U postgres -d seguros_db -c \
  "SELECT usuario_id, tipo, habilitado FROM dos_factores WHERE habilitado=true;"
```

### 🚀 Para Poner en Producción

1. ✅ Integrar Sendgrid/Twilio (reemplazar stubs en `enviarEmail`/`enviarSMS`)
2. ✅ Cambiar `JWT_SECRET` a valor fuerte
3. ✅ Certificado SSL/HTTPS
4. ✅ Rate limiting en endpoints
5. ✅ Validación de email al registrar
6. ✅ Backup automático de BD
7. ✅ Monitoreo de logs

### 📞 Support

Para dudas de integración, ver `SETUP_2FA_ADMIN.md`
