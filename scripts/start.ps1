[CmdletBinding()]
param([switch]$SeedDemoUsers)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $repoRoot ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Не найден .env. Сначала выполните из корня: Copy-Item .env.example .env, затем заполните локальные пароли."
}

$shopCompose = @("compose", "--env-file", $envFile, "-p", "orderflow-shop", "-f", "docker-compose.woocommerce.yml")
$appCompose = @("compose", "--env-file", $envFile, "-p", "orderflow", "-f", "docker-compose.yml", "-f", "docker-compose.integrations.yml")

function Get-LocalSetting([string]$Name) {
    $entry = Get-Content -LiteralPath $envFile -Encoding UTF8 |
        Where-Object { $_ -match "^\s*$([regex]::Escape($Name))\s*=" } |
        Select-Object -Last 1
    if ($entry) {
        return (($entry -split "=", 2)[1]).Trim().Trim([char]34, [char]39)
    }
}

function Set-LocalSettings([System.Collections.IDictionary]$Settings) {
    $content = [IO.File]::ReadAllText($envFile)
    $newline = if ($content.Contains("`r`n")) { "`r`n" } else { "`n" }
    foreach ($name in $Settings.Keys) {
        $line = "$name=$($Settings[$name])"
        $pattern = "(?m)^[\t ]*$([regex]::Escape($name))[\t ]*=[^\r\n]*"
        if ([regex]::IsMatch($content, $pattern)) {
            $content = [regex]::Replace($content, $pattern, $line)
        } else {
            if ($content -and !$content.EndsWith("`n")) { $content += $newline }
            $content += $line + $newline
        }
    }
    $temporaryFile = "$envFile.$([guid]::NewGuid()).tmp"
    $backupFile = "$temporaryFile.bak"
    try {
        [IO.File]::WriteAllText($temporaryFile, $content, [Text.UTF8Encoding]::new($false))
        [IO.File]::Replace($temporaryFile, $envFile, $backupFile)
    } finally {
        Remove-Item -LiteralPath $temporaryFile, $backupFile -ErrorAction SilentlyContinue
    }
}

foreach ($key in @("JWT_SECRET_KEY", "POSTGRES_PASSWORD", "DATABASE_URL", "WC_DB_PASSWORD", "WC_DB_ROOT_PASSWORD")) {
    if ([string]::IsNullOrWhiteSpace((Get-LocalSetting $key))) {
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
        $consumerKey = Get-LocalSetting "WOOCOMMERCE_CONSUMER_KEY"
        $consumerSecret = Get-LocalSetting "WOOCOMMERCE_CONSUMER_SECRET"
        if ([bool]$consumerKey -ne [bool]$consumerSecret) {
            throw "Укажи оба ключа WooCommerce в .env или оставь оба поля пустыми."
        }
        $baseUrl = Get-LocalSetting "WOOCOMMERCE_BASE_URL"
        $localIntegration = !$baseUrl -or $baseUrl.TrimEnd("/") -eq "http://wordpress"
        $credentialsMode = if ($localIntegration -and !$consumerKey) { "generate" } else { "configured" }

        if (-not (Get-LocalSetting "WC_ADMIN_PASSWORD")) {
            $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
            try {
                $bytes = New-Object byte[] 24
                $random.GetBytes($bytes)
                Set-LocalSettings @{ WC_ADMIN_PASSWORD = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant() }
            } finally {
                $random.Dispose()
            }
        }

        Write-Host "Запускаю WooCommerce и MySQL..." -ForegroundColor Cyan
        & docker @shopCompose up --build -d
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось запустить WooCommerce. Проверьте WC_DB_PASSWORD и WC_DB_ROOT_PASSWORD в .env."
        }

        Write-Host "Проверяю настройку WooCommerce и ключи интеграции..." -ForegroundColor Cyan
        $bootstrapOutput = & docker @shopCompose exec -T --user www-data wordpress env HOME=/tmp sh /opt/orderflow/bootstrap.sh $credentialsMode
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось подготовить WooCommerce. Проверьте вывод WP-CLI выше."
        }
        $shop = ($bootstrapOutput | Select-Object -Last 1 | ConvertFrom-Json)
        $settings = [ordered]@{}
        if ($shop.credentials) {
            if ($shop.credentials.key -cnotmatch '^ck_[0-9a-f]{40}$' -or $shop.credentials.secret -cnotmatch '^cs_[0-9a-f]{40}$') {
                throw "WooCommerce вернул ключи в неожиданном формате."
            }
            $settings["WOOCOMMERCE_CONSUMER_KEY"] = $shop.credentials.key
            $settings["WOOCOMMERCE_CONSUMER_SECRET"] = $shop.credentials.secret
        }
        if (-not $baseUrl) {
            $settings["WOOCOMMERCE_BASE_URL"] = "http://wordpress"
        }
        if ($settings.Count -gt 0) { Set-LocalSettings $settings }

        Write-Host "Собираю и запускаю OrderFlow..." -ForegroundColor Cyan
        & docker @appCompose up --build --wait --wait-timeout 120
        if ($LASTEXITCODE -ne 0) {
            throw "Не удалось запустить OrderFlow. Проверьте вывод Docker Compose выше."
        }

        if ($shop.sync_catalog -and $localIntegration) {
            Write-Host "Синхронизирую исходный каталог с PostgreSQL..." -ForegroundColor Cyan
            & docker @appCompose exec -T backend python -m orderflow.integrations.woocommerce.bootstrap
            if ($LASTEXITCODE -ne 0) { throw "Не удалось выполнить первую синхронизацию каталога." }
            & docker @shopCompose exec -T --user www-data wordpress env HOME=/tmp wp --path=/var/www/html option update orderflow_catalog_synced 1
            if ($LASTEXITCODE -ne 0) { throw "Не удалось сохранить статус синхронизации каталога." }
        }

        if ($SeedDemoUsers) {
            Write-Host "Создаю три демо-аккаунта OrderFlow..." -ForegroundColor Cyan
            & docker @appCompose exec -T backend python -m orderflow.seed --users-only
            if ($LASTEXITCODE -ne 0) {
                throw "OrderFlow запущен, но демо-аккаунты создать не удалось. Проверьте вывод Docker Compose выше."
            }
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
