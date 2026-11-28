import asyncio
from collections.abc import Awaitable, Callable
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

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


def test_user_can_update_own_name_and_password() -> None:
    async def scenario(
        client: AsyncClient, email: str, password: str, user_id: int, role_name: str,
    ) -> None:
        profile = {"name": "  Новое имя  "}
        assert (await client.patch("/auth/me", json=profile)).status_code == 401

        credentials = {"email": email, "password": password}
        login = await client.post("/auth/login", json=credentials)
        assert login.status_code == 200
        token = login.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        forbidden_role = await client.patch(
            "/auth/me", json={**profile, "role": "ADMIN"}, headers=headers,
        )
        assert forbidden_role.status_code == 422

        updated = await client.patch("/auth/me", json=profile, headers=headers)
        assert updated.status_code == 200
        result = {"id": user_id, "email": email, "name": "Новое имя", "role": role_name}
        assert updated.json() == result
        assert (await client.get("/auth/me", headers=headers)).json() == result

        new_password = "updated-test-password"
        incorrect = await client.patch(
            "/auth/me/password",
            json={"current_password": "wrong", "new_password": new_password},
            headers=headers,
        )
        assert incorrect.status_code == 400
        assert (await client.post("/auth/login", json=credentials)).status_code == 200

        changed = await client.patch(
            "/auth/me/password",
            json={"current_password": password, "new_password": new_password},
            headers=headers,
        )
        assert changed.status_code == 204
        assert (await client.post("/auth/login", json=credentials)).status_code == 401
        assert (await client.post("/auth/login", json={**credentials, "password": new_password})).status_code == 200

    asyncio.run(_run_auth_case(scenario))


def test_registration_creates_an_operator_who_can_log_in() -> None:
    async def scenario() -> None:
        email = f"register-{uuid4().hex}@example.test"
        password = "registration-test-password"
        payload = {"name": "  Тестовый оператор  ", "email": email, "password": password}
        transport = ASGITransport(app=app)
        try:
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                forbidden_role = await client.post(
                    "/auth/register", json={**payload, "role": "ADMIN"},
                )
                assert forbidden_role.status_code == 422

                responses = await asyncio.gather(
                    client.post("/auth/register", json=payload),
                    client.post("/auth/register", json=payload),
                )
                assert sorted(response.status_code for response in responses) == [201, 409]
                account = next(response.json() for response in responses if response.status_code == 201)
                assert account["email"] == email

                login = await client.post("/auth/login", json={"email": email, "password": password})
                assert login.status_code == 200
                token = login.json()["access_token"]
                current = await client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
                assert current.status_code == 200
                assert current.json() == {**account, "name": "Тестовый оператор", "role": "OPERATOR"}
        finally:
            try:
                async with SessionFactory.begin() as session:
                    user_ids = select(User.id).where(User.email == email)
                    await session.execute(delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids)))
                    await session.execute(delete(User).where(User.email == email))
            finally:
                await engine.dispose()

    asyncio.run(scenario())


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
