# Берём готовый образ с Python 3.13
FROM python:3.13-slim

# Создаём/выбираем рабочую папку внутри контейнера
WORKDIR /app


# Копируем файл с настройками и зависимостями Python
COPY pyproject.toml ./

# Копируем исходный код backend внутрь контейнера
COPY src ./src

# Копируем настройки Alembic
COPY alembic.ini ./

# Копируем миграции базы данных
COPY migrations ./migrations

# Устанавливаем backend и его Python-зависимости
RUN pip install --no-cache-dir .


# Команда, которая запускается при старте контейнера
CMD ["uvicorn", "orderflow.main:app", "--host", "0.0.0.0", "--port", "8000"]