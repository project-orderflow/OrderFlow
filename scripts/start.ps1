[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Не найден .env. Сначала выполните из корня: Copy-Item .env.example .env, затем заполните локальные пароли."
}

$envLines = Get-Content -LiteralPath $envFile
foreach ($key in @("JWT_SECRET_KEY", "POSTGRES_PASSWORD", "DATABASE_URL", "WC_DB_PASSWORD", "WC_DB_ROOT_PASSWORD")) {
    $entry = $envLines | Where-Object { $_ -match "^\s*$([regex]::Escape($key))=" } | Select-Object -First 1
    if (-not $entry -or [string]::IsNullOrWhiteSpace(($entry -split "=", 2)[1])) {
        throw "В .env отсутствует или пуст параметр $key. Добавьте его по шаблону из .env.example."
    }
}

Push-Location $repoRoot
try {
    & docker info *> $null
    if ($LASTEXITCODE -ne 0) {
        throw "Docker недоступен. Запустите Docker Desktop и повторите команду."
    }

    $networks = & docker network ls --format "{{.Name}}"
    if ($LASTEXITCODE -ne 0) {
        throw "Не удалось прочитать список Docker-сетей."
    }
    if ($networks -notcontains "orderflow-integrations") {
        Write-Host "Создаю общую Docker-сеть orderflow-integrations..." -ForegroundColor Cyan
        & docker network create orderflow-integrations
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось создать сеть orderflow-integrations."
        }
    }

    # A host-side test may have set DATABASE_URL to localhost:55432 in this
    # PowerShell session. Docker Compose would inherit it and pass the host URL
    # into the backend container, where localhost points at the container itself.
    $hadDatabaseUrl = Test-Path Env:DATABASE_URL
    $inheritedDatabaseUrl = $env:DATABASE_URL
    Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
    try {
        Write-Host "Запускаю WooCommerce и MySQL..." -ForegroundColor Cyan
        & docker compose --env-file $envFile -p orderflow-shop -f docker-compose.woocommerce.yml up -d
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось запустить WooCommerce. Проверьте WC_DB_PASSWORD и WC_DB_ROOT_PASSWORD в .env."
        }

        Write-Host "Собираю и запускаю OrderFlow..." -ForegroundColor Cyan
        & docker compose --env-file $envFile -p orderflow -f docker-compose.yml -f docker-compose.integrations.yml up --build -d
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось запустить OrderFlow. Проверьте вывод Docker Compose выше."
        }
    }
    finally {
        if ($hadDatabaseUrl) {
            $env:DATABASE_URL = $inheritedDatabaseUrl
        }
    }

    Write-Host "Окружение запущено." -ForegroundColor Green
    Write-Host "Frontend:     http://localhost/"
    Write-Host "Backend API:  http://localhost:8000/docs"
    Write-Host "WooCommerce:  http://localhost:8080"
    Write-Host "Данные БД и магазина сохраняются в Docker volumes. Не используйте down -v для обычного обновления."
    Write-Host "Логи backend: docker compose --env-file .env -p orderflow -f docker-compose.yml -f docker-compose.integrations.yml logs -f backend"
}
finally {
    Pop-Location
}
