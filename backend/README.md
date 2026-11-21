# OrderFlow Backend

Backend-сервис проекта OrderFlow.

## Запуск backend в терминале

Из корня репозитория выполните одну команду:

```bash
./backend/start-local.ps1
```

Скрипт сам создаёт виртуальное окружение, устанавливает зависимости, запускает
PostgreSQL в Docker, применяет миграции и запускает Uvicorn с access-логами.
Запросы frontend отображаются в этом же терминале. Для остановки нажмите
`Ctrl+C`.

Если нужен ручной запуск после установки зависимостей:

```powershell
Set-Location backend
.\.venv\Scripts\Activate.ps1
python -m alembic upgrade head
python -m uvicorn orderflow.main:app --app-dir src --reload --host 0.0.0.0 --port 8000 --access-log --log-level info
```

PostgreSQL должен быть доступен на `127.0.0.1:55432`.

## Swagger документация

http://127.0.0.1:8000/docs
