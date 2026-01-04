# 🔐 SegurosPro - Sistema 2FA y Admin Dashboard

## Implementación Completada

Se ha agregado seguridad de dos factores (2FA) y un panel de administración completo a SegurosPro.

### ✅ Componentes Creados

#### Frontend (React):
1. **LoginWith2FA.jsx** - Login mejorado con soporte para 2FA
   - Paso 1: Email/Password
   - Paso 2: Código 2FA (email o SMS)
   - Fallback a códigos de respaldo

2. **TwoFASetup.jsx** - Configuración de 2FA para usuarios
   - Elegir método: Email o SMS
   - Verificar código
   - Generar y guardar 10 códigos de respaldo

3. **AdminDashboard.jsx** - Panel administrativo con 5 secciones
   - **Invitaciones**: Crear/listar/eliminar códigos de invitación
   - **Suscripciones**: Ver y cambiar planes, cancelar suscripciones
   - **Pagos**: Historial de transacciones
   - **Planes**: Ver detalles de los 4 planes (FREE/STARTER/PROFESSIONAL/ENTERPRISE)
   - **Auditoría**: Registro completo de todas las acciones del sistema

#### Backend (Node.js):
Rutas agregadas en `server.js`:
- `GET /api/admin/invitaciones/listar` - Listar todas las invitaciones
- `POST /api/admin/invitaciones/crear` - Crear nuevas invitaciones
- `POST /api/admin/invitaciones/eliminar` - Eliminar invitación
- `GET /api/admin/suscripciones/listar` - Listar suscripciones
- `POST /api/admin/suscripciones/cambiar-plan` - Cambiar plan de usuario
- `POST /api/admin/suscripciones/cancelar` - Cancelar suscripción
- `GET /api/admin/pagos/listar` - Listar pagos
- `GET /api/admin/planes/listar` - Listar planes con estadísticas
- `GET /api/admin/auditoria/listar` - Ver registro de auditoría

### 🔒 Características de Seguridad

**2FA (Two-Factor Authentication):**
- Email: Envía código por correo
- SMS: Envía código por teléfono
- Códigos de 6 dígitos válidos por 15 minutos
- 10 códigos de respaldo para emergencias
- Lockout de 15 minutos tras 5 intentos fallidos

**Control de Acceso:**
- Solo usuarios con `rol='admin'` pueden acceder al dashboard
- JWT para autenticación segura
- Validación de autorización en cada endpoint

**Auditoría:**
- Cada acción importante se registra en la tabla `auditoria`
- Información: usuario, acción, recurso, detalles, timestamp

### 📋 Cómo Integrar

#### 1. Importar componentes en App.jsx:

```jsx
import LoginWith2FA from './components/LoginWith2FA';
import TwoFASetup from './components/TwoFASetup';
import AdminDashboard from './components/AdminDashboard';
```

#### 2. Usar LoginWith2FA en la pantalla de login:

```jsx
{/* Reemplazar el form de login existente con: */}
<LoginWith2FA onLoginSuccess={(user) => {
  setUser(user);
  setMode("dashboard");
}} />
```

#### 3. Agregar botón en Settings para configurar 2FA:

```jsx
{/* En la sección de settings del usuario */}
<button 
  onClick={() => setShowTwoFASetup(true)}
  className="btn btn-blue"
>
  🔐 Configurar 2FA
</button>

{showTwoFASetup && (
  <TwoFASetup 
    userId={user.id}
    onSuccess={() => {
      setShowTwoFASetup(false);
      showMessage("2FA configurado correctamente", "success");
    }}
  />
)}
```

#### 4. Mostrar AdminDashboard si el usuario es admin:

```jsx
{/* En el menú principal, agregar opción: */}
{user?.rol === "admin" && (
  <button onClick={() => setMenu("admin")} className="btn">
    👨‍💼 Admin
  </button>
)}

{/* En la vista: */}
{menu === "admin" && <AdminDashboard />}
```

### 🚀 Ejecutar

#### Iniciar Backend:
```bash
npm install
npm run server
```

#### Iniciar Frontend (en otra terminal):
```bash
npm run dev
```

### 📧 Configurar Email/SMS (Opcional)

Actualmente, el sistema imprime los códigos en la consola. Para producción:

#### Email (SendGrid):
1. Registrarse en SendGrid.com
2. Obtener API key
3. Agregar a `.env`: `SENDGRID_API_KEY=tu_key`
4. Actualizar función `enviarEmail` en `server.js`:

```javascript
const sgMail = require('@sendgrid/mail');
sgMail.setApiKey(process.env.SENDGRID_API_KEY);

const enviarEmail = async (email, asunto, codigo) => {
  await sgMail.send({
    to: email,
    from: 'noreply@seguros.com',
    subject: asunto,
    html: `Tu código 2FA es: <strong>${codigo}</strong>`
  });
};
```

#### SMS (Twilio):
1. Registrarse en Twilio.com
2. Obtener credenciales
3. Agregar a `.env`:
   - `TWILIO_ACCOUNT_SID=tu_sid`
   - `TWILIO_AUTH_TOKEN=tu_token`
   - `TWILIO_PHONE=+1234567890`
4. Actualizar función `enviarSMS`:

```javascript
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const enviarSMS = async (telefono, codigo) => {
  await client.messages.create({
    body: `Tu código 2FA es: ${codigo}`,
    from: process.env.TWILIO_PHONE,
    to: telefono
  });
};
```

### 🔑 Crear Admin User

Para crear un usuario admin, ejecutar en la BD:

```sql
INSERT INTO usuarios (nombre, email, password, rol, created_at)
VALUES ('Admin', 'admin@seguros.com', 'hashed_password', 'admin', NOW());
```

Asegúrate de hashear el password con bcrypt.

### 📊 Tablas de BD Requeridas

Ver archivos:
- `schema.sql` - Tablas base
- `schema_seguridad.sql` - Planes, suscripciones, invitaciones, auditoría
- `schema_2fa.sql` - 2FA y backup codes

### ⚙️ Variables de Entorno

Actualizar `.env`:

```
# Database
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=tu_password
DB_NAME=seguros_db
DB_PORT=5432

# JWT
JWT_SECRET=tu_secreto_muy_seguro

# Email (SendGrid)
SENDGRID_API_KEY=

# SMS (Twilio)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE=

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=

# OpenAI
OPENAI_API_KEY=

# Admin
ADMIN_KEY=clave_admin_secreta

PORT=5000
```

### 🛡️ Permisos Admin Dashboard

El dashboard solo es accesible para usuarios con `rol='admin'`. Verificar que el usuario logueado tenga:
- JWT válido
- `rol='admin'` en la BD

### 📝 Notas

- El login ahora hace 2 pasos en lugar de 1
- El 2FA es opcional por usuario (no forzado)
- Los códigos de respaldo son de un solo uso
- La auditoría se registra automáticamente
- Las invitaciones expiran en 30 días por defecto

¡Listo! Sistema 2FA y Admin Dashboard completamente funcional 🎉
