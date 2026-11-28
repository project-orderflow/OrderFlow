"""Import the initial catalog for a local WooCommerce installation."""

import asyncio

from orderflow.integrations.woocommerce.adapter import get_store_source_key
from orderflow.integrations.woocommerce.router import get_woocommerce_adapter
from orderflow.integrations.woocommerce.service import sync_products
from orderflow.shared.db.session import SessionFactory, engine


async def main() -> None:
    adapter = get_woocommerce_adapter()
    try:
        products = await adapter.fetch_products()
        async with SessionFactory() as session:
            counts = await sync_products(session, get_store_source_key(adapter.base_url), products)
    finally:
        await engine.dispose()
    print(f"WooCommerce catalog synchronized: {counts}")


if __name__ == "__main__":
    asyncio.run(main())
