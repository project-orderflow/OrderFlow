import asyncio
from collections.abc import Awaitable, Callable
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete

from orderflow.main import app
from orderflow.modules.identity.models import RefreshToken, Role, User
from orderflow.modules.identity.security import hash_password
from orderflow.shared.db.session import SessionFactory, engine


AuthCase = Callable[[AsyncClient, str, str, int, str], Awaitable[None]]


def test_login_returns_tokens_and_me_returns_current_user() -> None:
    async def scenario(
        client: AsyncClient,
        email: str,
        password: str,
        user_id: int,
        role_name: str,
    ) -> None:
        unauthenticated_response = await client.get("/auth/me")
        assert unauthenticated_response.status_code == 401

        login_response = await client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )
        assert login_response.status_code == 200
        tokens = login_response.json()
        assert tokens["token_type"] == "bearer"
        assert tokens["access_token"]
        assert tokens["refresh_token"]

        current_user_response = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {tokens['access_token']}"},
        )
        assert current_user_response.status_code == 200
        assert current_user_response.json() == {
            "id": user_id,
            "email": email,
            "role": role_name,
        }

    asyncio.run(_run_auth_case(scenario))


def test_login_rejects_invalid_credentials() -> None:
    async def scenario(
        client: AsyncClient,
        email: str,
        password: str,
        user_id: int,
        role_name: str,
    ) -> None:
        response = await client.post(
            "/auth/login",
            json={"email": email, "password": "incorrect-password"},
        )

        assert response.status_code == 401
        assert response.json() == {"detail": "Invalid credentials"}

    asyncio.run(_run_auth_case(scenario))


def test_refresh_rotates_and_revokes_previous_token() -> None:
    async def scenario(
        client: AsyncClient,
        email: str,
        password: str,
        user_id: int,
        role_name: str,
    ) -> None:
        login_response = await client.post(
            "/auth/login",
            json={"email": email, "password": password},
        )
        assert login_response.status_code == 200
        initial_tokens = login_response.json()

        refresh_response = await client.post(
            "/auth/refresh",
            json={"refresh_token": initial_tokens["refresh_token"]},
        )
        assert refresh_response.status_code == 200
        refreshed_tokens = refresh_response.json()
        assert refreshed_tokens["refresh_token"] != initial_tokens["refresh_token"]

        replay_response = await client.post(
            "/auth/refresh",
            json={"refresh_token": initial_tokens["refresh_token"]},
        )
        assert replay_response.status_code == 401
        assert replay_response.json() == {"detail": "Invalid refresh token"}

        current_user_response = await client.get(
            "/auth/me",
            headers={"Authorization": f"Bearer {refreshed_tokens['access_token']}"},
        )
        assert current_user_response.status_code == 200

    asyncio.run(_run_auth_case(scenario))


async def _run_auth_case(case: AuthCase) -> None:
    email, password, user_id, role_id, role_name = await _create_test_user()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await case(client, email, password, user_id, role_name)
    finally:
        await _delete_test_user(user_id, role_id)
        await engine.dispose()


async def _create_test_user() -> tuple[str, str, int, int, str]:
    email = f"auth-{uuid4().hex}@example.test"
    password = "correct-horse-battery-staple"
    role_name = f"AUTH_TEST_{uuid4().hex}"

    async with SessionFactory() as session:
        role = Role(name=role_name)
        session.add(role)
        await session.flush()

        user = User(
            email=email,
            hashed_password=hash_password(password),
            role_id=role.id,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        return email, password, user.id, role.id, role_name


async def _delete_test_user(user_id: int, role_id: int) -> None:
    async with SessionFactory() as session:
        await session.execute(
            delete(RefreshToken).where(RefreshToken.user_id == user_id)
        )
        await session.execute(delete(User).where(User.id == user_id))
        await session.execute(delete(Role).where(Role.id == role_id))
        await session.commit()
