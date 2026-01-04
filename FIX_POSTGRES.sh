#!/usr/bin/env bash

# SOLUCIÓN: Resetear contraseña de PostgreSQL

echo "=========================================="
echo "🔧 RESETEAR CONTRASEÑA POSTGRESQL"
echo "=========================================="
echo ""

# Buscar instalación de PostgreSQL
PGPATH="C:\\Program Files\\PostgreSQL\\15\\bin"
PGPATH_ALT="C:\\Program Files\\PostgreSQL\\16\\bin"

if [ ! -d "$PGPATH" ]; then
    PGPATH="$PGPATH_ALT"
fi

if [ ! -d "$PGPATH" ]; then
    echo "❌ PostgreSQL no encontrado en Program Files"
    echo "💡 Descarga de: https://www.postgresql.org/download/windows/"
    exit 1
fi

echo "✅ PostgreSQL encontrado en: $PGPATH"
echo ""
echo "Para resetear la contraseña:"
echo "1. Abre: $PGPATH"
echo "2. Ejecuta: psql -U postgres"
echo "3. En la consola de psql, escribe:"
echo "   ALTER USER postgres WITH PASSWORD 'postgres';"
echo "   \q"
echo ""
echo "O ejecuta este comando en PowerShell (como Administrador):"
echo '"C:\\Program Files\\PostgreSQL\\15\\bin\\psql" -U postgres -c "ALTER USER postgres WITH PASSWORD '"'"'postgres'"'"';"'
