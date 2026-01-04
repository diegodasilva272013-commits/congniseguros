# 🚀 GUÍA: Instalar PostgreSQL y Configurar BD

## Paso 1: Instalar PostgreSQL

### En Windows:
1. Descarga desde: https://www.postgresql.org/download/windows/
2. Ejecuta el instalador
3. **IMPORTANTE**: Anota la contraseña que ingreses para el usuario `postgres`
4. Deja el puerto en **5432** (por defecto)
5. Completa la instalación

### Alternativa con Docker (si tienes Docker instalado):
```bash
docker run --name cogniseguros-db -e POSTGRES_PASSWORD=postgres -p 5432:5432 -d postgres:15
```

---

## Paso 2: Configurar Variables de Entorno

Edita el archivo `.env` en la raíz del proyecto:

```env
DB_HOST=localhost
DB_USER=postgres
DB_PASSWORD=postgres    # ← Cambiar si usaste otra contraseña
DB_NAME=cogniseguros
DB_PORT=5432

JWT_SECRET=tu_secreto_super_seguro_cambiar_en_produccion

WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_ACCESS_TOKEN=
OPENAI_API_KEY=
SENDGRID_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE=

PORT=5000
```

---

## Paso 3: Ejecutar el Setup de BD

Una vez que PostgreSQL está corriendo, ejecuta:

```bash
npm run setup-db
```

Este comando:
✅ Crea la BD `cogniseguros`  
✅ Crea todas las tablas (usuarios, planes, invitaciones, 2FA, auditoría)  
✅ Inserta 4 planes (FREE, STARTER, PROFESSIONAL, ENTERPRISE)  
✅ Crea 2 usuarios de test  
✅ Crea suscripciones de prueba  

**Salida esperada:**
```
🔧 Iniciando setup de BD...

1️⃣  Creando BD 'cogniseguros'...
✅ BD creada

2️⃣  Creando tablas base...
  ✓ tabla: usuarios
  ✓ tabla: clientes

3️⃣  Creando tablas de membresía...
  ✓ tabla: planes
  ✓ tabla: suscripciones
  ✓ tabla: invitaciones
  ✓ tabla: auditoria

4️⃣  Creando tablas 2FA...
  ✓ tabla: dos_factores
  ✓ tabla: backup_codes

5️⃣  Insertando planes...
  ✓ Plan: FREE
  ✓ Plan: STARTER
  ✓ Plan: PROFESSIONAL
  ✓ Plan: ENTERPRISE

6️⃣  Creando usuarios de test...
  ✓ Usuario: test@test.com (contraseña: 123456)
  ✓ Usuario: admin@test.com (contraseña: admin123)

7️⃣  Creando suscripciones de test...
  ✓ Suscripción STARTER para usuario test
  ✓ Suscripción ENTERPRISE para admin

✅ ¡Setup completado exitosamente!

📝 Credenciales de prueba:
  - test@test.com / 123456 (Usuario regular)
  - admin@test.com / admin123 (Admin - ver Dashboard)
```

---

## Paso 4: Iniciar la Aplicación

Abre **dos terminales**:

**Terminal 1 - Backend:**
```bash
npm run server
```

**Terminal 2 - Frontend:**
```bash
npm run dev
```

---

## Paso 5: Probar

Abre http://localhost:3000 y usa:

**Login Normal:**
- Email: `test@test.com`
- Contraseña: `123456`

**Admin Dashboard:**
- Email: `admin@test.com`
- Contraseña: `admin123`

---

## ¿Qué Puedo Hacer Ahora?

✅ **Login con 2FA** - Configura en Settings → "Autenticación de Dos Factores"  
✅ **Admin Dashboard** - Visible solo si eres admin  
✅ **Ver Suscripción** - Tu plan actual y acceso a características  
✅ **Invitaciones** - Admin puede crear códigos para nuevos usuarios  
✅ **Auditoría** - Todas las acciones quedan registradas  

---

## Troubleshooting

**Error: "Cannot connect to PostgreSQL"**
- Verifica que PostgreSQL está corriendo
- En Windows: Abre "Services" y busca "postgresql"
- Verifica credenciales en `.env`

**Error: "Port 5432 already in use"**
```bash
# Windows - liberar puerto
netstat -ano | findstr :5432
taskkill /PID <PID> /F
```

**Error: "Database already exists"**
- El setup borra la BD anterior
- Si quieres conservar datos, modifica `setup-db.js` y comenta la línea `DROP DATABASE`

---

**¡Listo! Ahora tu aplicación funciona al 100% con BD real, 2FA, Admin Dashboard y todo el sistema completo! 🎉**
