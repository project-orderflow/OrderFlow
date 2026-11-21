[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

$backendDir = $PSScriptRoot
$repoDir = Split-Path -Parent $backendDir
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"
$composeEnvFile = Join-Path $repoDir ".env.example"

if (-not (Test-Path $venvPython)) {
    $systemPython = Get-Command python -ErrorAction SilentlyContinue
    if ($null -eq $systemPython) {
        throw "Python не найден в PATH. Установите Python 3.13+ и повторите запуск."
    }

    Write-Host "Создаю виртуальное окружение backend/.venv..." -ForegroundColor Cyan
    & $systemPython.Source -m venv $backendDir\.venv
}

$dependenciesReady = $true
$null = & $venvPython -c "import alembic, asyncpg, uvicorn" 2>$null
if ($LASTEXITCODE -ne 0) {
    $dependenciesReady = $false
}

if (-not $dependenciesReady) {
    Write-Host "Устанавливаю зависимости backend..." -ForegroundColor Cyan
    & $venvPython -m pip install -e "${backendDir}[dev]"
}

function Import-EnvironmentFile {
    param([string]$Path)

    if (Test-Path $Path) {
        foreach ($line in Get-Content $Path) {
            $trimmedLine = $line.Trim()
            if ($trimmedLine -match '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
                $name = $Matches[1]
                $value = $Matches[2].Trim()
                if ($value.Length -ge 2 -and $value.StartsWith('"') -and $value.EndsWith('"')) {
                    $value = $value.Substring(1, $value.Length - 2)
                }
                Set-Item -Path "Env:$name" -Value $value
            }
        }
    }
}

Import-EnvironmentFile $composeEnvFile
Import-EnvironmentFile (Join-Path $repoDir ".env")

if ([string]::IsNullOrWhiteSpace($env:JWT_SECRET_KEY)) {
    $env:JWT_SECRET_KEY = "change_this_to_a_long_random_secret"
}

if ($env:DATABASE_URL -match '^(postgresql\+asyncpg://[^@]+)@[^/]+/([^?]+)(.*)$') {
    $env:DATABASE_URL = "$($Matches[1])@127.0.0.1:55432/$($Matches[2])$($Matches[3])"
}
else {
    throw "Не удалось подготовить DATABASE_URL для PostgreSQL из Docker."
}

$postgresReady = Test-NetConnection -ComputerName 127.0.0.1 -Port 55432 -InformationLevel Quiet -WarningAction SilentlyContinue
if (-not $postgresReady) {
    $docker = Get-Command docker -ErrorAction SilentlyContinue
    if ($null -eq $docker) {
        throw "PostgreSQL недоступен на порту 55432, а Docker не найден в PATH."
    }

    Write-Host "Запускаю PostgreSQL в Docker..." -ForegroundColor Cyan
    & $docker.Source compose --env-file $composeEnvFile up -d postgres
    if ($LASTEXITCODE -ne 0) {
        throw "Не удалось запустить PostgreSQL через Docker Compose."
    }

    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        Start-Sleep -Seconds 1
        $postgresReady = Test-NetConnection -ComputerName 127.0.0.1 -Port 55432 -InformationLevel Quiet -WarningAction SilentlyContinue
        if ($postgresReady) {
            break
        }
    }
}

if (-not $postgresReady) {
    throw "PostgreSQL не отвечает на 127.0.0.1:55432. Проверьте: docker compose --env-file .env.example ps -a"
}

$portInUse = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
if ($null -ne $portInUse) {
    throw "Порт 8000 уже занят. Если запущен Docker backend, выполните: docker compose --env-file .env.example stop backend"
}

Push-Location $backendDir
try {
    Write-Host "Применяю миграции..." -ForegroundColor Cyan
    & $venvPython -m alembic upgrade head
    if ($LASTEXITCODE -ne 0) {
        throw "Миграции не применились. Проверьте DATABASE_URL и логи PostgreSQL."
    }

    Write-Host "Запускаю backend. Логи запросов будут видны здесь. Для остановки нажмите Ctrl+C." -ForegroundColor Green
    & $venvPython -m uvicorn orderflow.main:app --app-dir (Join-Path $backendDir "src") --reload --host 0.0.0.0 --port 8000 --access-log --log-level info
}
finally {
    Pop-Location
}
