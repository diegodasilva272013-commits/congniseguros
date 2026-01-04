Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "🔧 RESETEAR CONTRASEÑA POSTGRESQL" -ForegroundColor Cyan
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host ""

# Detectar ruta PostgreSQL
$pgPaths = @(
    "C:\Program Files\PostgreSQL\16\bin",
    "C:\Program Files\PostgreSQL\15\bin",
    "C:\Program Files\PostgreSQL\14\bin"
)

$pgPath = $null
foreach ($path in $pgPaths) {
    if (Test-Path $path) {
        $pgPath = $path
        break
    }
}

if (-not $pgPath) {
    Write-Host "❌ PostgreSQL no encontrado" -ForegroundColor Red
    Write-Host "💡 Descarga desde: https://www.postgresql.org/download/windows/" -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ PostgreSQL encontrado en: $pgPath" -ForegroundColor Green
Write-Host ""

# Intentar resetear contraseña
$psqlPath = "$pgPath\psql.exe"

Write-Host "📝 Reseteando contraseña de postgres..." -ForegroundColor Yellow
$output = & $psqlPath -U postgres -c "ALTER USER postgres WITH PASSWORD 'postgres';" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Contraseña reseteada a 'postgres'" -ForegroundColor Green
} else {
    Write-Host "⚠️ Intenta ejecutar PowerShell como Administrador" -ForegroundColor Yellow
    Write-Host "$output" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Siguiente paso: npm run setup-db" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Cyan
