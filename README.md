# OrderFlow

Back-office платформа управления исполнением заказов.

## Требования

- Docker Desktop с включённым Linux engine и Docker Compose v2.
- Git для получения репозитория.

Для полного запуска в Docker Node.js и PostgreSQL локально устанавливать не
требуется. Для режима разработки с backend в терминале понадобятся Python 3.13+
и Node.js для frontend.

## Какой режим выбрать

- Если нужно просто запустить приложение — используйте полный Docker-запуск:
  `docker compose --env-file .env.example up --build -d`.
- Если нужно видеть запросы от кнопок frontend в реальном времени — запускайте
  PostgreSQL в Docker, а backend локально через `uvicorn` командой
  `.\backend\start-local.ps1`. Логи будут в текущем терминале.

## Запуск полного приложения через Docker

Все команды ниже выполняются из корня репозитория.

### 1. Получить репозиторий

Если проект ещё не склонирован:

```powershell
git clone https://github.com/project-orderflow/OrderFlow.git
Set-Location OrderFlow
```

Если проект уже есть локально, перейдите в его корень:

```powershell
Set-Location C:\путь\к\OrderFlow
```

### 2. Проверить Docker

Запустите Docker Desktop и убедитесь, что используется Linux engine:

```powershell
docker --version
docker compose version
```

### 3. Быстрый запуск одной командой

Для локальной демонстрации можно использовать готовый шаблон без создания
`.env`:

```powershell
docker compose --env-file .env.example up --build -d
```

Эта команда использует значения из `.env.example`, включая демонстрационный
JWT-секрет. Такой запуск предназначен только для локальной разработки и
демонстрации.

### 4. Рекомендуемая локальная конфигурация

Создайте `.env` из шаблона:

```powershell
Copy-Item .env.example .env
```

Откройте `.env` и замените значение `JWT_SECRET_KEY` на длинный случайный
секрет:

```powershell
notepad .env
```

Файл `.env` нельзя добавлять в Git.

### 5. Собрать и запустить все сервисы

```powershell
docker compose up --build -d
```

Команда запускает:

- `postgres` — PostgreSQL;
- `backend` — FastAPI на порту `8000`;
- `frontend` — React/Vite, собранный и отданный Nginx на порту `80`.

Backend ждёт готовности PostgreSQL, автоматически применяет миграции Alembic
и только после этого считается healthy. Frontend запускается после healthy
backend.

### 6. Проверить состояние

```powershell
docker compose ps
```

Ожидаемый результат: `postgres` и `backend` имеют статус `healthy`, а
`frontend` — `running`.

При необходимости посмотреть логи:

```powershell
docker compose logs -f backend
docker compose logs -f frontend
```

### 7. Открыть приложение

- Frontend: http://localhost/
- Backend Swagger: http://localhost:8000/docs
- Backend health: http://localhost:8000/health

Дополнительная проверка из PowerShell:

```powershell
Invoke-WebRequest http://localhost:8000/health
Invoke-WebRequest http://localhost/
```

### 8. Остановить приложение

```powershell
docker compose down
```

Эта команда удаляет контейнеры и сеть, но сохраняет данные PostgreSQL в
named volume. Для следующего запуска достаточно выполнить:

```powershell
docker compose up -d
```

После изменения Dockerfile или исходного кода используйте:

```powershell
docker compose up --build -d
```

### 9. Полностью сбросить локальную базу

Команда удаляет PostgreSQL volume вместе со всеми локальными данными:

```powershell
docker compose down -v
```

Используйте её только если данные больше не нужны. Если после pull появляется
`password authentication failed`, это обычно означает, что существующий volume
был создан с другим паролем. При отсутствии важных данных выполните `down -v`,
затем снова пройдите шаг 4.

## Первый запуск в режиме разработки

Все команды выполняются из корня репозитория
`C:\Github_Projects\OrderFlow\orderflow`.

1. Создайте локальный `.env` из шаблона:

```powershell
Copy-Item .env.example .env
notepad .env
```

Проверьте, что в нём есть `JWT_SECRET_KEY`. Файл `.env` не добавляется в Git.

2. Запустите backend в отдельном терминале:

```powershell
.\backend\start-local.ps1
```

При первом запуске скрипт создаёт `backend/.venv` и устанавливает зависимости.
Затем он запускает только PostgreSQL в Docker, применяет миграции и запускает
локальный Uvicorn с access-логами. Запросы frontend будут видны в этом же
терминале, например `POST /auth/login 200 OK`.

3. Во втором терминале установите зависимости frontend — это нужно только при
первом запуске или после изменения `package-lock.json`:

```powershell
Set-Location frontend
npm ci
```

4. Запустите frontend:

```powershell
npm run dev:local
```

Vite проксирует `/api` на backend `http://127.0.0.1:8000`. Приложение будет
доступно по адресу http://localhost:5173.

Если Docker-backend уже запущен и занял порт `8000`, перед локальным запуском
остановите только его из корня проекта:

```powershell
docker compose --env-file .env.example stop backend
```

## Логи в реальном времени

Для локального backend логи уже отображаются в терминале, где запущен
`.\backend\start-local.ps1`. Нажатия кнопок frontend будут видны как HTTP
запросы Uvicorn.

Если backend запущен в Docker, смотрите его логи из корня проекта:

```powershell
docker compose --env-file .env.example logs -f --tail=100 backend
```

`Ctrl+C` останавливает только просмотр логов, но не контейнер.

## Повторный запуск

Для обычного запуска всех сервисов без вывода логов в текущий терминал:

```powershell
docker compose --env-file .env.example up -d
```

Для разработки с backend в терминале повторно выполните:

```powershell
.\backend\start-local.ps1
```

Зависимости повторно устанавливать не нужно, если не менялся
`backend/pyproject.toml`.

## Файлы окружения

Файлы `.env` индивидуальны для каждого разработчика:

- `.env.example` — общий безопасный шаблон проекта. Он хранится в Git и содержит
  демонстрационные значения, одинаковые для команды.
- `.env` — личная локальная конфигурация разработчика. Его нужно создать из
  шаблона и при необходимости изменить пароль PostgreSQL, JWT-секрет и другие
  параметры:

  ```powershell
  Copy-Item .env.example .env
  ```

- `.env` не добавляется в Git и не передаётся другим разработчикам: у каждого
  должны быть свои локальные секреты.
- Команда с `--env-file .env.example` запускает Compose напрямую с шаблоном и
  подходит для быстрого локального демонстрационного запуска.
- Обычный `docker compose up` использует личный корневой `.env`, если он создан.

Скрипт `backend/start-local.ps1` сначала загружает `.env.example`, затем
перекрывает значения из корневого `.env`. Поэтому индивидуальные настройки
сохраняются, а отсутствующие обязательные параметры берутся из шаблона.

`frontend/.env.example` — отдельный шаблон только для локальных переменных
frontend. Его не следует смешивать с корневым `.env` backend и Compose.
