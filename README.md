# OrderFlow

Back-office платформа управления исполнением заказов.

## Backend и PostgreSQL

Команды выполняются из корня репозитория. Требуется Docker Desktop с Linux engine и Docker Compose v2.

### Первый запуск

Скопируй шаблон настроек и открой локальный файл:

```powershell
Copy-Item .env.example .env
notepad .env
```

Замени `JWT_SECRET_KEY` отдельным случайным секретом. Сгенерировать его можно командой:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

`POSTGRES_PASSWORD` — пароль базы. Такой же пароль укажи в `DATABASE_URL` между `orderflow:` и `@postgres`. Это не JWT-секрет. Файл `.env` личный, его не коммитить.

Запусти PostgreSQL и backend:

```powershell
docker compose --env-file .env up --build -d postgres backend
```

При старте backend автоматически применяет ожидающие миграции Alembic. Текущие миграции уже выполнены. Запускать `alembic` вручную на Windows не нужно.

Проверь запуск:

```powershell
docker compose --env-file .env ps
Invoke-WebRequest http://localhost:8000/health
```

API: http://localhost:8000/docs

Создай одинаковые локальные demo-данные:

```powershell
docker compose --env-file .env exec backend python -m orderflow.seed
```

Для входа используй `admin@orderflow.local` и значение `ORDERFLOW_DEMO_PASSWORD` из `.env`.

## Frontend для локальной разработки

В отдельном терминале:

```powershell
Set-Location frontend
npm ci
npm run dev:local
```

`npm ci` нужен при первом запуске и после изменения `package-lock.json`. Открой URL, который покажет Vite, обычно http://localhost:5173.

## Логи backend в реальном времени

Из корня репозитория:

```powershell
docker compose --env-file .env logs -f --tail=100 backend
```

`Ctrl+C` остановит просмотр логов, контейнер продолжит работать.

## Обычный запуск и остановка

После перезагрузки компьютера:

```powershell
docker compose --env-file .env up -d postgres backend
```

Остановить сервисы, сохранив базу:

```powershell
docker compose --env-file .env down
```

Подробное руководство, включая работу с паролями и восстановление, находится в [backend/DOCKER.md](backend/DOCKER.md).

Чтобы запустить все сервисы, включая frontend в Docker/Nginx на http://localhost/:

```powershell
docker compose --env-file .env up --build -d
```
