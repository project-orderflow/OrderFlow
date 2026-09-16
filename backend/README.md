# OrderFlow Backend

Backend-сервис проекта OrderFlow.

## Запуск

Создать виртуальное окружение:

```bash
python -m venv .venv
```
## Активировать окружение

.\.venv\Scripts\Activate.ps1

## Установить зависимости

pip install -e ".[dev]"

## Запустить приложение

uvicorn orderflow.main:app --reload

## Swagger документация

http://127.0.0.1:8000/docs