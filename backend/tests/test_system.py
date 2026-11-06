import asyncio

from fastapi.testclient import TestClient
from sqlalchemy import text

from orderflow.main import app, settings
from orderflow.shared.db.session import engine


client = TestClient(app)


def test_health_returns_ok() -> None:
    response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_system_info_returns_application_metadata() -> None:
    response = client.get("/api/v1/system/info")

    assert response.status_code == 200
    assert response.json() == {
        "name": settings.app_name,
        "version": app.version,
        "environment": settings.environment,
    }


def test_database_connection() -> None:
    async def check_connection() -> None:
        try:
            async with engine.connect() as connection:
                result = await connection.execute(text("SELECT 1"))

                assert result.scalar_one() == 1
        finally:
            await engine.dispose()

    asyncio.run(check_connection())
