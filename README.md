# OrderFlow

Back-office платформа управления исполнением заказов.

## Настройка JWT

Перед запуском API добавьте в локальный `.env` непредсказуемый секрет:

```text
JWT_SECRET_KEY=<long-random-secret>
```

Не добавляйте `.env` в Git. Остальные JWT-параметры и безопасные placeholders
указаны в `.env.example`.
