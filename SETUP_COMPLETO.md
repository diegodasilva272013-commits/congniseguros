# ✅ CHECKLIST FUNCIONAL - CogniSeguros + PostgreSQL

## 📋 Estado Actual (3 Enero 2026)

### ✅ Completado:
- [x] Node.js v24.12.0 instalado
- [x] npm v11.6.2 instalado
- [x] Estructura del proyecto (server.js, src/App.jsx, etc.)
- [x] Dependencias en package.json configuradas
- [x] archivo .env con variables de entorno
- [x] Schema SQL preparado (schema.sql)
- [x] Setup script creado (setup-db.js)
- [x] Vite + Tailwind configurados
- [x] Express server configurado

### ⚠️ PENDIENTE - PostgreSQL:
- [ ] PostgreSQL instalado en el sistema
- [ ] PostgreSQL en PATH de Windows
- [ ] Base de datos "cogniseguros" creada
- [ ] Tablas creadas
- [ ] Usuarios de prueba insertados

---

## 🚀 PASOS PARA DEJAR TODO FUNCIONAL

### PASO 1: Instalar PostgreSQL en Windows

1. **Descarga el instalador:**
   - Ir a: https://www.postgresql.org/download/windows/
   - Descargar PostgreSQL 16 (versión más reciente)

2. **Ejecuta el instalador:**
   - Click en el .exe descargado
   - Acepta la ubicación por defecto: `C:\Program Files\PostgreSQL\16`
   - **IMPORTANTE**: Anota la contraseña de `postgres` que usarás
   - Puerto: deja **5432** (por defecto)
   - Locale: Spanish / Español
   - Marca "Install PostgreSQL as a service" (servicio)

3. **Después de instalar, añade PostgreSQL a PATH:**
   - Busca en Windows: "Variables de entorno"
   - Click en "Editar variables de entorno del sistema"
   - Click en "Variables de entorno..."
   - En "Variables del sistema", busca "Path" y haz click en "Editar"
   - Click en "Nuevo"
   - Pega: `C:\Program Files\PostgreSQL\16\bin`
   - Click OK, OK, OK
   - Reinicia el terminal (PowerShell)

4. **Verifica que PostgreSQL esté en PATH:**
   ```powershell
   psql --version
   ```
   Deberías ver: `psql (PostgreSQL) 16.x`

---

### PASO 2: Configurar .env

El archivo `.env` ya tiene los datos básicos, pero verifica:

```env
DB_USER=postgres
DB_HOST=localhost
DB_NAME=cogniseguros
DB_PASSWORD=postgres          # ← Usa la contraseña que pusiste en la instalación
DB_PORT=5432

PORT=5000
ADMIN_KEY=tu_admin_key_super_secreto

WHATSAPP_PHONE_NUMBER_ID=tu_phone_id_aqui
WHATSAPP_ACCESS_TOKEN=tu_token_aqui
OPENAI_API_KEY=tu_openai_key_aqui
```

---

### PASO 3: Crear la Base de Datos

**Opción A: Automático (recomendado)**

```powershell
cd "c:\Users\diego\OneDrive\Desktop\App Cogniseguros"
npm run setup-db
```

Este comando:
1. Crea la BD "cogniseguros"
2. Crea todas las tablas
3. Inserta usuarios de prueba

**Opción B: Manual (si tienes experiencia con SQL)**

```powershell
psql -U postgres -h localhost
```

Luego en la consola psql:

```sql
CREATE DATABASE cogniseguros;
\c cogniseguros
-- Copia todo el contenido de schema.sql y pégalo aquí
```

---

### PASO 4: Instalar Dependencias del Proyecto

```powershell
cd "c:\Users\diego\OneDrive\Desktop\App Cogniseguros"
npm install
```

Esto instala todas las librerías necesarias.

---

### PASO 5: Iniciar el Servidor + Frontend

**Opción A: Ambos juntos (recomendado para desarrollo)**

```powershell
npm run dev-both
```

Esto abre:
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

**Opción B: Por separado**

Terminal 1 (Backend):
```powershell
npm run server
```

Terminal 2 (Frontend):
```powershell
npm run dev
```

---

### PASO 6: Probar la Aplicación

1. **Abre el navegador:** http://localhost:5173
   (En este proyecto Vite corre en http://localhost:3000)
2. **Haz login con:**
   - Email: `test@test.com`
   - Contraseña: `123456`
   
3. **O registra una cuenta nueva:**
   - Nombre: Ej: "Mi Aseguradora"
   - Email: ej@example.com
   - Contraseña: cualquiera

4. **Portal Cliente:**
   - DNI: Prueba con el de un cliente creado

---

## 🔗 Conexión Frontend ↔ Backend

El frontend vive en `src/App.jsx`. El proyecto usa proxy de Vite para hablar con el backend local.

**Para usar backend local (recomendado):**

- Levanta backend: `npm run server` (http://localhost:5000)
- Levanta frontend: `npm run dev` (http://localhost:3000)
- O ambos juntos: `npm run dev-both`

Si tenés problemas con `localhost`, probá abrir http://127.0.0.1:3000

---

## 📊 Verificar que PostgreSQL está funcionando

Abre PowerShell y corre:

```powershell
psql -U postgres -h localhost -d cogniseguros -c "SELECT COUNT(*) FROM usuarios;"
```

Si ves un número (ej: 2), ¡PostgreSQL está conectado! 🎉

---

## ❌ Troubleshooting

### Error: "psql no es reconocido"
- Reinicia PowerShell después de agregar PostgreSQL a PATH
- Verifica que C:\Program Files\PostgreSQL\16\bin existe

### Error: "connection refused"
- Verifica que PostgreSQL esté corriendo: `services.msc` → PostgreSQL debe estar en "Running"
- Verifica el puerto 5432: `netstat -ano | findstr :5432`

### Error: "password authentication failed"
- Revisa que la contraseña en .env sea la que pusiste en la instalación
- Si olvidaste, reinstala PostgreSQL

### Database "cogniseguros" no existe
- Ejecuta: `npm run setup-db`

### Puertos ocupados
- Backend port 5000: `netstat -ano | findstr :5000`
- Frontend port 5173: `netstat -ano | findstr :5173`

---

## 📦 Estructura de Carpetas

```
App Cogniseguros/
├── src/
│   └── App.jsx            ← Frontend (source of truth)
├── server.js          ← Backend Express
├── package.json       ← Dependencias
├── .env               ← Variables de entorno
├── setup-db.js        ← Script para crear BD
├── schema.sql         ← Estructura de tablas
├── vite.config.js     ← Config Vite
└── tailwind.config.js ← Config Tailwind
```

---

## 🎯 Próximos Pasos

1. ✅ Instalar PostgreSQL
2. ✅ Configurar .env
3. ✅ Ejecutar `npm install`
4. ✅ Ejecutar `npm run setup-db`
5. ✅ Ejecutar `npm run dev-both`
6. ✅ Abrir http://localhost:5173
   (o http://localhost:3000)
7. ✅ Verificar que todo funciona

---

## 📞 Resumen Rápido

**Para dejar todo funcional:**

```powershell
# 1. Instalar PostgreSQL (descarga + instalador)
# 2. Agregar a PATH (reiniciar PowerShell)
# 3. Verificar: psql --version

cd "c:\Users\diego\OneDrive\Desktop\App Cogniseguros"

# 4. Crear BD
npm run setup-db

# 5. Instalar dependencias
npm install

# 6. Iniciar todo
npm run dev-both

# 7. Abre: http://localhost:5173
```

¡Listo! 🚀
