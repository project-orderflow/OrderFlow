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
COPY entrypoint.sh ./entrypoint.sh

# Устанавливаем backend и его Python-зависимости
RUN pip install --no-cache-dir .

RUN chmod +x ./entrypoint.sh

# Миграции применяются перед запуском API.
ENTRYPOINT ["/app/entrypoint.sh"]
