import asyncio
from collections.abc import Awaitable, Callable
from uuid import uuid4

from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from orderflow.main import app
from orderflow.modules.catalog.models import Product
from orderflow.modules.identity.models import RefreshToken, Role, User
from orderflow.modules.identity.security import hash_password
from orderflow.shared.db.session import SessionFactory, engine


CatalogCase = Callable[[AsyncClient, str, str, str, str, str], Awaitable[None]]


def test_admin_can_create_read_and_update_products() -> None:
    async def scenario(
        client: AsyncClient,
        admin_email: str,
        admin_password: str,
        operator_email: str,
        operator_password: str,
        sku_prefix: str,
    ) -> None:
        unauthenticated_response = await client.get("/products")
        assert unauthenticated_response.status_code == 401

        admin_tokens = await _login(client, admin_email, admin_password)
        headers = _authorization_headers(admin_tokens["access_token"])
        sku = f"{sku_prefix}-ONE"

        create_response = await client.post(
            "/products",
            headers=headers,
            json={
                "sku": sku.lower(),
                "name": "Test product",
                "price": "19.99",
            },
        )
        assert create_response.status_code == 201
        product = create_response.json()
        assert product["sku"] == sku
        assert product["name"] == "Test product"
        assert product["price"] == "19.99"
        assert product["active"] is True

        list_response = await client.get("/products", headers=headers)
        assert list_response.status_code == 200
        assert any(item["id"] == product["id"] for item in list_response.json())

        patch_response = await client.patch(
            f"/products/{product['id']}",
            headers=headers,
            json={"name": "Updated product", "price": "24.50", "active": False},
        )
        assert patch_response.status_code == 200
        assert patch_response.json()["name"] == "Updated product"
        assert patch_response.json()["price"] == "24.50"
        assert patch_response.json()["active"] is False

    asyncio.run(_run_catalog_case(scenario))


def test_operator_can_read_but_cannot_modify_products() -> None:
    async def scenario(
        client: AsyncClient,
        admin_email: str,
        admin_password: str,
        operator_email: str,
        operator_password: str,
        sku_prefix: str,
    ) -> None:
        admin_tokens = await _login(client, admin_email, admin_password)
        admin_headers = _authorization_headers(admin_tokens["access_token"])
        create_response = await client.post(
            "/products",
            headers=admin_headers,
            json={
                "sku": f"{sku_prefix}-ONE",
                "name": "Test product",
                "price": "19.99",
            },
        )
        assert create_response.status_code == 201
        product_id = create_response.json()["id"]

        operator_tokens = await _login(client, operator_email, operator_password)
        operator_headers = _authorization_headers(operator_tokens["access_token"])

        read_response = await client.get("/products", headers=operator_headers)
        assert read_response.status_code == 200

        create_forbidden_response = await client.post(
            "/products",
            headers=operator_headers,
            json={
                "sku": f"{sku_prefix}-TWO",
                "name": "Forbidden product",
                "price": "10.00",
            },
        )
        assert create_forbidden_response.status_code == 403
        assert create_forbidden_response.json() == {
            "detail": "Insufficient permissions"
        }

        patch_forbidden_response = await client.patch(
            f"/products/{product_id}",
            headers=operator_headers,
            json={"active": False},
        )
        assert patch_forbidden_response.status_code == 403

    asyncio.run(_run_catalog_case(scenario))


def test_product_validation_and_sku_conflicts() -> None:
    async def scenario(
        client: AsyncClient,
        admin_email: str,
        admin_password: str,
        operator_email: str,
        operator_password: str,
        sku_prefix: str,
    ) -> None:
        admin_tokens = await _login(client, admin_email, admin_password)
        headers = _authorization_headers(admin_tokens["access_token"])
        sku = f"{sku_prefix}-ONE"

        invalid_price_response = await client.post(
            "/products",
            headers=headers,
            json={"sku": sku, "name": "Invalid price", "price": "0"},
        )
        assert invalid_price_response.status_code == 422

        blank_sku_response = await client.post(
            "/products",
            headers=headers,
            json={"sku": "   ", "name": "Blank SKU", "price": "10.00"},
        )
        assert blank_sku_response.status_code == 422

        create_response = await client.post(
            "/products",
            headers=headers,
            json={"sku": sku, "name": "Valid product", "price": "10.00"},
        )
        assert create_response.status_code == 201

        duplicate_sku_response = await client.post(
            "/products",
            headers=headers,
            json={"sku": sku.lower(), "name": "Duplicate SKU", "price": "11.00"},
        )
        assert duplicate_sku_response.status_code == 409
        assert duplicate_sku_response.json() == {"detail": "SKU already exists"}

    asyncio.run(_run_catalog_case(scenario))


async def _run_catalog_case(case: CatalogCase) -> None:
    sku_prefix = f"TEST-{uuid4().hex}"
    admin_email, admin_password, admin_id = await _create_test_user("ADMIN")
    operator_email, operator_password, operator_id = await _create_test_user("OPERATOR")
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await case(
                client,
                admin_email,
                admin_password,
                operator_email,
                operator_password,
                sku_prefix,
            )
    finally:
        await _delete_test_records(
            sku_prefix,
            [admin_id, operator_id],
        )
        await engine.dispose()


async def _create_test_user(role_name: str) -> tuple[str, str, int]:
    email = f"{role_name.lower()}-{uuid4().hex}@example.test"
    password = "correct-horse-battery-staple"

    async with SessionFactory() as session:
        role = await session.scalar(select(Role).where(Role.name == role_name))
        assert role is not None

        user = User(
            email=email,
            hashed_password=hash_password(password),
            role_id=role.id,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)

        return email, password, user.id


async def _delete_test_records(sku_prefix: str, user_ids: list[int]) -> None:
    async with SessionFactory() as session:
        await session.execute(
            delete(RefreshToken).where(RefreshToken.user_id.in_(user_ids))
        )
        await session.execute(delete(User).where(User.id.in_(user_ids)))
        await session.execute(
            delete(Product).where(Product.sku.like(f"{sku_prefix}%"))
        )
        await session.commit()


async def _login(
    client: AsyncClient,
    email: str,
    password: str,
) -> dict[str, str]:
    response = await client.post(
        "/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200
    return response.json()


def _authorization_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
