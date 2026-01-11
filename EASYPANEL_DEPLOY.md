# Deploy en Hostinger + EasyPanel (Sprint 0)

## Objetivo
Deploy reproducible por Docker + healthchecks + secrets via EasyPanel.

## Health endpoints
- Liveness: `GET /live` (o `/api/live`) → siempre 200 si el proceso está vivo
- Readiness: `GET /ready` (o `/api/ready`) → 200 solo si DB responde; si no 503
- Diagnóstico: `GET /api/health` → devuelve `build_id`, `db_connected`, etc.

Recomendación EasyPanel:
- Healthcheck path: `/ready` (más estricto)
- Alternativa: `/api/health` (más tolerante)

## Variables de entorno (EasyPanel)
Mínimas:
- `PORT=80`
- `HOST=0.0.0.0`
- `NODE_ENV=production`
- `JWT_SECRET` (larga, random)
- `ADMIN_KEY` (larga, random)

PostgreSQL:
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `DB_ADMIN_DB=postgres` (recomendado)

Diagnóstico:
- `APP_BUILD_ID` = sha del commit (EasyPanel puede setearlo o usar envs propias)

Bootstrapping (NO recomendado en prod):
- `RUN_DB_SETUP=0`
- `RUN_MIGRATIONS=0`

## Imagen Docker (GitHub → GHCR)
Este repo incluye workflow que publica en GHCR:
- `ghcr.io/<owner>/<repo>:<sha>`
- `:latest` y `:prod` en `main`
- `:staging` en `develop`

EasyPanel debe apuntar a esa imagen (registry GHCR) y hacer pull en cada deploy.

## Deploy automático desde GitHub Actions
Opcional:
- Crear secret `EASYPANEL_WEBHOOK_URL` en GitHub.
- Ese webhook debe disparar un redeploy en EasyPanel.

## Docker Compose (local)
Para correr app + Postgres local:
```bash
docker compose up --build
```
Luego:
- App: `http://localhost:8080/`
- Ready: `http://localhost:8080/ready`

Nota: el compose activa `RUN_DB_SETUP=1` para inicializar DB en local.
