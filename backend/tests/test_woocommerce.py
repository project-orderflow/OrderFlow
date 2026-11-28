import asyncio
import base64
import hashlib
import hmac
from decimal import Decimal
from uuid import uuid4

import httpx
import pytest
from sqlalchemy import delete, select

from orderflow.integrations.woocommerce.adapter import (
    WooCommerceAPIError,
    WooCommerceAdapter,
    get_store_source_key,
)
from orderflow.integrations.woocommerce.schemas import WooOrder, WooProduct
from orderflow.integrations.woocommerce.security import verify_webhook_signature
from orderflow.integrations.woocommerce.service import receive_order, sync_products
from orderflow.modules.catalog.models import ExternalProduct, Product
from orderflow.modules.orders.models import ExternalOrder, Order, OrderItem
from orderflow.shared.db.session import SessionFactory, engine


def test_source_key_is_store_specific_and_excludes_api_suffix() -> None:
    assert get_store_source_key("https://shop.example/store/wp-json/wc/v3/") == (
        "woocommerce://shop.example/store"
    )


def test_source_key_rejects_urls_with_credentials() -> None:
    with pytest.raises(ValueError):
        get_store_source_key("https://user:password@shop.example")


def test_adapter_fetches_paginated_products_and_uses_basic_auth() -> None:
    pages: list[int] = []
    expected_auth = "Basic " + base64.b64encode(b"ck_test:cs_test").decode("ascii")

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/store/wp-json/wc/v3/products"
        assert request.headers["Authorization"] == expected_auth
        page = int(request.url.params["page"])
        pages.append(page)
        body = [
            {"id": page, "sku": f"sku-{page}", "name": f"Product {page}", "price": "12.50"}
        ]
        return httpx.Response(
            200,
            json=body,
            headers={"X-WP-TotalPages": "2"},
        )

    async def scenario() -> None:
        adapter = WooCommerceAdapter(
            "https://shop.example/store",
            "ck_test",
            "cs_test",
            transport=httpx.MockTransport(handler),
        )
        products = await adapter.fetch_products()
        assert [product.id for product in products] == [1, 2]
        assert products[0].price == Decimal("12.50")

    asyncio.run(scenario())
    assert pages == [1, 2]


def test_adapter_fetches_orders_from_orders_resource() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/wp-json/wc/v3/orders"
        return httpx.Response(
            200,
            json=[
                {
                    "id": 45,
                    "number": "1045",
                    "status": "processing",
                    "currency": "USD",
                    "total": "24.00",
                    "line_items": [],
                }
            ],
            headers={"X-WP-TotalPages": "1"},
        )

    async def scenario() -> None:
        adapter = WooCommerceAdapter(
            "https://shop.example", "ck_test", "cs_test",
            transport=httpx.MockTransport(handler),
        )
        orders = await adapter.fetch_orders()
        assert len(orders) == 1
        assert orders[0].id == 45
        assert orders[0].total == Decimal("24.00")

    asyncio.run(scenario())


def test_adapter_reports_api_status_without_exposing_credentials() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"message": "not authorized"})

    async def scenario() -> None:
        adapter = WooCommerceAdapter(
            "https://shop.example", "private-key", "private-secret",
            transport=httpx.MockTransport(handler),
        )
        with pytest.raises(WooCommerceAPIError, match="HTTP 401") as error:
            await adapter.fetch_products()
        assert "private-key" not in str(error.value)
        assert "private-secret" not in str(error.value)

    asyncio.run(scenario())


def test_webhook_signature_checks_raw_body_and_rejects_bad_values() -> None:
    body = b'{"id":123,"status":"processing"}'
    secret = "test-webhook-secret"
    signature = base64.b64encode(
        hmac.new(secret.encode(), body, hashlib.sha256).digest()
    ).decode("ascii")

    assert verify_webhook_signature(body, signature, secret)
    assert not verify_webhook_signature(body + b" ", signature, secret)
    assert not verify_webhook_signature(body, "not-base64!", secret)
    assert not verify_webhook_signature(body, None, secret)


def test_order_schema_preserves_unknown_sku_and_parses_woocommerce_payload() -> None:
    order = WooOrder.model_validate(
        {
            "id": 123,
            "status": "processing",
            "currency": "usd",
            "total": "19.99",
            "line_items": [
                {
                    "product_id": 999,
                    "sku": "unmapped-sku",
                    "name": "Unknown product",
                    "quantity": 1,
                    "price": "19.99",
                    "total": "19.99",
                }
            ],
        }
    )
    assert order.currency == "USD"
    assert order.line_items[0].sku == "unmapped-sku"


def test_product_sync_upserts_by_source_and_external_id() -> None:
    async def scenario() -> None:
        source = f"woocommerce://{uuid4().hex}.example"
        external_id = int(uuid4().int % 999_999_999) + 1
        sku = f"WC-TEST-{uuid4().hex[:16]}".upper()
        try:
            async with SessionFactory() as session:
                first = await sync_products(
                    session,
                    source,
                    [WooProduct(id=external_id, sku=sku.lower(), name="Imported", price="10.00")],
                )
                assert first == {"created": 1, "updated": 0, "skipped": 0}

                second = await sync_products(
                    session,
                    source,
                    [WooProduct(id=external_id, sku=sku, name="Updated", price="12.50")],
                )
                assert second == {"created": 0, "updated": 1, "skipped": 0}
                product = await session.scalar(select(Product).where(Product.sku == sku))
                assert product is not None
                assert product.name == "Updated"
                assert product.price == Decimal("12.50")
        finally:
            async with SessionFactory() as cleanup_session:
                await cleanup_session.execute(
                    delete(ExternalProduct).where(ExternalProduct.external_system == source)
                )
                await cleanup_session.execute(
                    delete(Product).where(Product.sku == sku)
                )
                await cleanup_session.commit()
            await engine.dispose()

    asyncio.run(scenario())


def test_webhook_order_is_idempotent_and_keeps_unmapped_sku() -> None:
    async def scenario() -> None:
        source = f"woocommerce://{uuid4().hex}.example"
        external_id = int(uuid4().int % 999_999_999) + 1
        payload = WooOrder.model_validate(
            {
                "id": external_id,
                "number": str(external_id),
                "status": "processing",
                "currency": "USD",
                "total": "19.99",
                "billing": {"first_name": "Test", "last_name": "Customer"},
                "line_items": [
                    {
                        "product_id": 987654321,
                        "sku": "UNKNOWN-TEST-SKU",
                        "name": "Unmapped item",
                        "quantity": 1,
                        "price": "19.99",
                        "total": "19.99",
                    }
                ],
            }
        )
        order_id = None
        try:
            async with SessionFactory() as session:
                metadata = {"body_sha256": "test-digest", "topic": "order.created"}
                first_id, created = await receive_order(session, source, payload, metadata)
                order_id = first_id
                duplicate_id, duplicate_created = await receive_order(
                    session, source, payload, metadata
                )
                assert created is True
                assert duplicate_created is False
                assert first_id == duplicate_id
                order_id = first_id

                item = await session.scalar(
                    select(OrderItem).where(OrderItem.order_id == first_id)
                )
                assert item is not None
                assert item.product_id is None
                assert item.external_sku == "UNKNOWN-TEST-SKU"
        finally:
            async with SessionFactory() as cleanup_session:
                if order_id is not None:
                    await cleanup_session.execute(
                        delete(ExternalOrder).where(
                            ExternalOrder.external_system == source,
                            ExternalOrder.external_order_id == str(external_id),
                        )
                    )
                    await cleanup_session.execute(
                        delete(OrderItem).where(OrderItem.order_id == order_id)
                    )
                    await cleanup_session.execute(delete(Order).where(Order.id == order_id))
                    await cleanup_session.commit()
            await engine.dispose()

    asyncio.run(scenario())
