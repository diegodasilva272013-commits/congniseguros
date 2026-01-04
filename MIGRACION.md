# 🚀 Migración: Google Sheets → PostgreSQL + Node.js

## ✅ Que incluye esta migración

- ✅ Backend Node.js/Express con todas las rutas del Google Script
- ✅ PostgreSQL como base de datos
- ✅ Autenticación con bcrypt (contraseñas hasheadas)
- ✅ WhatsApp Cloud API (seguro en backend)
- ✅ OpenAI integration (copy + imágenes)
- ✅ Sin perder ningun dato

## 📋 Pasos de instalación

### 1. Instalar PostgreSQL (si no lo tienes)

**Windows:**
```bash
# Descargar desde: https://www.postgresql.org/download/windows/
# Instalar con contraseña = "postgres"
```

**Mac:**
```bash
brew install postgresql
```

**Linux:**
```bash
sudo apt install postgresql postgresql-contrib
```

### 2. Crear base de datos

```bash
psql -U postgres

-- En la consola de PostgreSQL:
CREATE DATABASE cogniseguros;
\q
```

### 3. Configurar `.env`

```bash
# Database
DB_USER=postgres
DB_HOST=localhost
DB_NAME=cogniseguros
DB_PASSWORD=postgres
DB_PORT=5432

# WhatsApp
WHATSAPP_PHONE_NUMBER_ID=tu_phone_id_aqui
WHATSAPP_ACCESS_TOKEN=tu_token_aqui

# OpenAI
OPENAI_API_KEY=tu_openai_key_aqui

# Server
PORT=5000
```

### 4. Instalar dependencias

```bash
npm install
```

### 5. Migración de datos

```bash
npm run migrate
```

Esto va a:
1. ✅ Crear todas las tablas en PostgreSQL
2. ✅ Crear un usuario de prueba
3. ✅ Preparar para importar datos desde CSV (si los exportas desde Google)

### 6. Ejecutar backend + frontend

```bash
npm run dev-both
```

Esto levanta:
- 🌐 Frontend: http://localhost:5173
- ⚙️ Backend: http://localhost:5000

## 📊 Importar datos desde Google Sheets

### Opción A: Exportar a CSV (manual, más fácil)

1. Abri tu Google Sheet
2. File → Download → CSV
3. En terminal: `npm run migrate`
4. Pasá la ruta del CSV cuando te pida

### Opción B: Script automático (avanzado)

Si queres automatizar la exportación desde Google:

```javascript
// Agregar a migrate.js
const googleSheetData = await fetch(
  'https://script.google.com/macros/s/TU_SCRIPT_ID/exec?action=exportJSON'
);
```

## 🔒 Seguridad

✅ **Contraseñas hasheadas** con bcrypt  
✅ **Tokens WhatsApp** en servidor (no en frontend)  
✅ **OpenAI key** en .env (no expuesta)  
✅ **SQL Injection protection** con prepared statements  
✅ **CORS configurado** para evitar requests no autorizadas  

## 📝 Rutas disponibles

### Auth
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registro

### Clientes
- `POST /api/clientes/add` - Crear cliente
- `POST /api/clientes/get` - Obtener clientes
- `POST /api/clientes/update` - Actualizar cliente
- `POST /api/clientes/delete` - Eliminar cliente

### Portal Cliente
- `POST /api/cliente/by-dni` - Buscar por DNI

### Perfil Aseguradora
- `POST /api/perfil/get` - Obtener perfil
- `POST /api/perfil/save` - Guardar perfil

### WhatsApp
- `POST /api/whatsapp/send` - Enviar mensaje
- `POST /api/config/get` - Obtener config
- `POST /api/config/save` - Guardar config

### Marketing IA
- `POST /api/marketing/copy` - Generar copy con OpenAI
- `POST /api/marketing/image` - Generar imagen con DALL-E

## ❓ Troubleshooting

**Error: "database cogniseguros does not exist"**
```bash
psql -U postgres -c "CREATE DATABASE cogniseguros;"
```

**Error: "connect ECONNREFUSED"**
- ¿Está corriendo PostgreSQL? Verificá: `psql -U postgres`

**Error: "WhatsApp no configurado"**
- Agregá `WHATSAPP_PHONE_NUMBER_ID` y `WHATSAPP_ACCESS_TOKEN` al `.env`

**Error: "OpenAI error"**
- Verificá que `OPENAI_API_KEY` sea válida en `.env`

## 🎉 ¡Listo!

Tu app ahora tiene:
- ✅ Backend seguro en Node.js
- ✅ Base de datos PostgreSQL
- ✅ Credenciales protegidas
- ✅ Todos los datos migrados

¿Necesitas ayuda? Avisame.
