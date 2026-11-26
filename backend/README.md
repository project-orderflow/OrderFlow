# OrderFlow Backend

Backend-сервис проекта OrderFlow.

## Локальный запуск в Docker

Основная инструкция по запуску PostgreSQL и backend, миграциям, demo seed, логам и остановке находится в [DOCKER.md](DOCKER.md).

Из корня репозитория backend и PostgreSQL запускаются командой:

```powershell
docker compose --env-file .env up --build -d postgres backend
```

## Swagger документация

http://127.0.0.1:8000/docs
