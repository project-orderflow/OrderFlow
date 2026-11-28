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

## Запуск OrderFlow и WooCommerce одной командой

WooCommerce запускается отдельным Compose-проектом: в Docker Desktop появятся
две группы — `orderflow` (OrderFlow) и `orderflow-shop` (WordPress и MySQL).
Чтобы Backend мог обращаться к магазину, проекты соединяются общей Docker-сетью
`orderflow-integrations`.

### Первый запуск магазина

При первом запуске создай `.env` из шаблона, если ещё не сделал это выше:

```powershell
Copy-Item .env.example .env
notepad .env
```

Проверь и замени локальные значения `JWT_SECRET_KEY`, `POSTGRES_PASSWORD` и
`DATABASE_URL` по инструкции выше. Если `.env` был создан до добавления
WooCommerce, добавь в него строки `WC_DB_PASSWORD` и `WC_DB_ROOT_PASSWORD` из
нового `.env.example`. Эти параметры
задают пароли только для локальных MySQL и WordPress контейнеров. Не отправляй
свой `.env` другим участникам и не коммить его.

После первоначальной настройки запускай оба Compose-проекта одной командой из
корня репозитория:

```powershell
.\scripts\start.ps1
```

Скрипт создаёт `orderflow-integrations`, только если сети ещё нет, запускает
магазин, затем пересобирает и запускает OrderFlow. Данные PostgreSQL, WordPress
и MySQL остаются в Docker volumes.

При первом старте открой http://localhost:8080, закончи настройку WordPress,
установи и активируй WooCommerce, импортируй демонстрационные товары и создай
REST API-ключи с правами чтения. Это пока одноразовая ручная настройка каждого
локального магазина. Впиши ключи в свой `.env` (`WOOCOMMERCE_BASE_URL` для
интеграционной сети — `http://wordpress`, `WOOCOMMERCE_CONSUMER_KEY` и
`WOOCOMMERCE_CONSUMER_SECRET`) и повторно запусти скрипт.

`WOOCOMMERCE_WEBHOOK_SECRET` нужен только для проверки webhook заказов.
Без WooCommerce API-ключей основной OrderFlow всё равно запускается, но
синхронизация товаров из магазина работать не будет.

### После обновления из GitHub

Когда изменения влиты в `main`, из корня проекта выполни:

```powershell
git switch main
git pull --ff-only origin main
.\scripts\start.ps1
```

Для просмотра статуса и логов:

```powershell
docker compose --env-file .env -p orderflow -f docker-compose.yml -f docker-compose.integrations.yml ps
docker compose --env-file .env -p orderflow -f docker-compose.yml -f docker-compose.integrations.yml logs -f backend
```

Frontend доступен на http://localhost/, API — на http://localhost:8000/docs,
магазин — на http://localhost:8080. Не используй `docker compose down -v` при
обычном обновлении: эта команда удалит локальные данные.
