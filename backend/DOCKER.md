# Локальная работа с backend в Docker

Руководство для запуска PostgreSQL и backend на компьютере разработчика. Все команды выполняются из корня репозитория.

## Требования

- Docker Desktop запущен и использует Linux engine.
- Docker Compose v2.
- Node.js нужен только для локального запуска frontend через Vite.

## 1. Настроить `.env` один раз

Создай личный файл настроек:

```powershell
Copy-Item .env.example .env
notepad .env
```

В `.env` настрой разные секреты для приложения и базы:

- `JWT_SECRET_KEY` — секрет подписи токенов приложения. Сгенерируй его и вставь только в эту переменную:

  ```powershell
  python -c "import secrets; print(secrets.token_urlsafe(48))"
  ```

- `POSTGRES_PASSWORD` — пароль пользователя PostgreSQL.
- `DATABASE_URL` — строка подключения backend к PostgreSQL.

Пароль в `POSTGRES_PASSWORD` должен совпадать с паролем в `DATABASE_URL`. В строке подключения оставь пользователя `orderflow`, хост `postgres`, порт `5432` и базу `orderflow`. Например, один и тот же `DB_PASSWORD` стоит в обеих строках:

```dotenv
POSTGRES_USER=orderflow
POSTGRES_PASSWORD=DB_PASSWORD
POSTGRES_DB=orderflow
DATABASE_URL=postgresql+asyncpg://orderflow:DB_PASSWORD@postgres:5432/orderflow
```

Замени `DB_PASSWORD` одним локальным значением в обеих строках; не оставляй угловые скобки и не добавляй кавычки. Для простоты используй латинские буквы и цифры. `JWT_SECRET_KEY` — другое значение.

`.env` индивидуальный и не должен попадать в Git. `ORDERFLOW_DEMO_PASSWORD` задаёт пароль локальных demo-аккаунтов; значение из `.env.example` можно оставить для одинаковой проверки командой.

## 2. Первый запуск и миграции

Запусти только PostgreSQL и backend:

```powershell
docker compose --env-file .env up --build -d postgres backend
```

PostgreSQL и backend работают в отдельных контейнерах. Backend подключается к базе по адресу `postgres:5432` внутри сети Compose. Порт базы на компьютере разработчика — `55432`.

При старте `backend/entrypoint.sh` автоматически выполняет `alembic upgrade head`, затем запускает Uvicorn на порту `8000`. Текущие миграции уже применены. При будущих изменениях backend пересобери его командой `up --build`; новые ожидающие миграции применятся при старте. Не запускай `alembic` на Windows.

Проверь состояние и API:

```powershell
docker compose --env-file .env ps -a
Invoke-WebRequest http://localhost:8000/health
```

Ожидаемый результат: `postgres` и `backend` работают, backend имеет статус `healthy`, health endpoint возвращает HTTP 200. Swagger: http://localhost:8000/docs.

Если backend завершился со статусом `Exited`, причина будет в его логах:

```powershell
docker compose --env-file .env logs --tail=100 backend
```

## 3. Создать одинаковые demo-данные

После успешного запуска backend выполни:

```powershell
docker compose --env-file .env exec backend python -m orderflow.seed
```

Seed добавляет роли, три demo-пользователя и десять товаров. Повторный запуск безопасен: существующие записи не удаляются и не перезаписываются. Заказы не создаются.

| Роль | Email | Пароль |
| --- | --- | --- |
| ADMIN | `admin@orderflow.local` | значение `ORDERFLOW_DEMO_PASSWORD` из `.env` |
| OPERATOR | `operator@orderflow.local` | значение `ORDERFLOW_DEMO_PASSWORD` из `.env` |
| WAREHOUSE | `warehouse@orderflow.local` | значение `ORDERFLOW_DEMO_PASSWORD` из `.env` |

В `.env.example` задано локальное значение `ORDERFLOW_DEMO_PASSWORD=OrderFlowDemo!2026`. Если ты его изменил, используй своё значение. Seed не меняет пароль уже созданного пользователя.

## 4. Запустить frontend

Для локальной разработки через Vite открой второй терминал:

```powershell
Set-Location frontend
npm ci
npm run dev:local
```

`npm ci` нужен при первой установке и после изменения `package-lock.json`. Открой адрес Vite, обычно http://localhost:5173. Backend и PostgreSQL при этом остаются в Docker.

Полный запуск всех сервисов, включая frontend под Nginx в Docker:

```powershell
docker compose --env-file .env up --build -d
```

В этом режиме frontend доступен по адресу http://localhost/.

## 5. Смотреть логи

В отдельном терминале из корня репозитория:

```powershell
docker compose --env-file .env logs -f --tail=100 backend
```

Здесь видны применение миграций, запуск API и HTTP-запросы, дошедшие до backend. `Ctrl+C` прекращает только просмотр логов; контейнер продолжает работать.

Последние строки без постоянного просмотра:

```powershell
docker compose --env-file .env logs --tail=100 backend
```

## 6. Ежедневный запуск и остановка

После перезапуска Docker Desktop или компьютера:

```powershell
docker compose --env-file .env up -d postgres backend
```

Остановить контейнеры, сохранив базу:

```powershell
docker compose --env-file .env down
```

## 7. Пароль PostgreSQL и сброс локальной базы

`POSTGRES_PASSWORD` используется при первой инициализации Docker volume. Изменение `.env` само по себе не меняет пароль в уже существующей базе. Пароль роли `orderflow` в базе должен соответствовать паролю в `DATABASE_URL`.

Чтобы изменить пароль роли с сохранением данных, подключись к PostgreSQL:

```powershell
docker compose --env-file .env exec postgres psql -U orderflow -d orderflow
```

В `psql` выполни `\password orderflow`, введи новый пароль дважды и выйди командой `\q`. Ввод пароля не отображается. После изменения пересоздай только backend, чтобы он перечитал `.env`:

```powershell
docker compose --env-file .env up -d --force-recreate backend
```

Локальный вход в `psql` через сокет может не запрашивать пароль. Это не проверяет сетевой пароль, который использует backend.

Полностью удалить локальную базу можно только если её данные больше не нужны:

```powershell
docker compose --env-file .env down -v --remove-orphans
docker compose --env-file .env up --build -d postgres backend
```

`down -v` удаляет PostgreSQL volume, включая пользователей и demo-данные. Для обычной остановки используй `docker compose down` без `-v`.
