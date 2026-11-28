import hashlib
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from orderflow.integrations.woocommerce.schemas import WooOrder, WooProduct
from orderflow.modules.catalog.models import ExternalProduct, Product
from orderflow.modules.orders.models import ExternalOrder, Order, OrderItem


CENT = Decimal("0.01")
MAX_PRICE = Decimal("9999999999.99")


class WooCommerceSyncConflictError(Exception):
    pass


def _money(value: Decimal) -> Decimal:
    if not value.is_finite() or abs(value) > MAX_PRICE:
        raise ValueError("Order amount exceeds the supported range")
    try:
        return value.quantize(CENT, rounding=ROUND_HALF_UP)
    except InvalidOperation as error:
        raise ValueError("Order amount exceeds the supported range") from error


def _normalized_sku(value: str | None) -> str | None:
    normalized = value.strip().upper() if value else ""
    return normalized or None


def _fallback_sku(source: str, external_id: int) -> str:
    source_hash = hashlib.sha256(source.encode("utf-8")).hexdigest()[:8].upper()
    return f"WC-{source_hash}-{external_id}"[:100]


async def sync_products(
    session: AsyncSession,
    source: str,
    products: list[WooProduct],
) -> dict[str, int]:
    created = 0
    updated = 0
    skipped = 0

    try:
        for external_product in products:
            name = external_product.name.strip()
            price = external_product.price
            if (
                not name
                or price is None
                or not price.is_finite()
                or price <= 0
                or price > MAX_PRICE
            ):
                skipped += 1
                continue

            normalized_price = _money(price)
            external_id = str(external_product.id)
            external_sku = _normalized_sku(external_product.sku)
            if external_sku is not None and len(external_sku) > 100:
                skipped += 1
                continue
            local_sku = external_sku or _fallback_sku(source, external_product.id)

            mapping = await session.scalar(
                select(ExternalProduct)
                .options(selectinload(ExternalProduct.product))
                .where(
                    ExternalProduct.external_system == source,
                    ExternalProduct.external_product_id == external_id,
                )
            )
            product = mapping.product if mapping is not None else None

            if product is None:
                product = await session.scalar(
                    select(Product).where(Product.sku == local_sku)
                )

            if product is not None and external_sku and product.sku != external_sku:
                sku_owner = await session.scalar(
                    select(Product.id).where(
                        Product.sku == external_sku,
                        Product.id != product.id,
                    )
                )
                if sku_owner is not None:
                    skipped += 1
                    continue
                product.sku = external_sku

            was_created = product is None
            if was_created:
                product = Product(sku=local_sku, name=name[:255], price=normalized_price)
                session.add(product)
                await session.flush()
                created += 1
            else:
                updated += 1
                product.name = name[:255]
                product.price = normalized_price

            product.active = external_product.status == "publish"

            if mapping is None:
                session.add(
                    ExternalProduct(
                        product_id=product.id,
                        external_system=source,
                        external_product_id=external_id,
                        external_sku=external_sku,
                    )
                )
            else:
                mapping.external_sku = external_sku

        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise WooCommerceSyncConflictError from error

    return {"created": created, "updated": updated, "skipped": skipped}


async def receive_order(
    session: AsyncSession,
    source: str,
    payload: WooOrder,
    event_metadata: dict[str, str],
) -> tuple[UUID, bool]:
    external_id = str(payload.id)
    existing_order_id = await session.scalar(
        select(ExternalOrder.order_id).where(
            ExternalOrder.external_system == source,
            ExternalOrder.external_order_id == external_id,
        )
    )
    if existing_order_id is not None:
        return existing_order_id, False

    billing_name = " ".join(
        part.strip()
        for part in (payload.billing.first_name, payload.billing.last_name)
        if part and part.strip()
    )
    email = (payload.billing.email or "").strip() or None
    order = Order(
        id=uuid4(),
        number=(payload.number or external_id)[:100],
        status=(payload.status or "pending")[:30],
        currency=payload.currency.upper(),
        total=_money(payload.total),
        customer_name=billing_name[:255] or None,
        customer_email=email[:320] if email else None,
    )
    session.add(order)

    try:
        for item in payload.line_items:
            quantity = item.quantity
            line_total = _money(
                item.total
                if item.total is not None
                else (item.price or Decimal("0")) * quantity
            )
            unit_price = _money(
                item.price if item.price is not None else line_total / quantity
            )
            sku = _normalized_sku(item.sku)
            external_product_id = item.product_id or item.variation_id
            product_id = await _find_local_product(
                session,
                source,
                external_product_id,
                sku,
            )
            session.add(
                OrderItem(
                    order_id=order.id,
                    product_id=product_id,
                    external_product_id=(str(external_product_id) if external_product_id else None),
                    external_sku=sku,
                    name=(item.name.strip() or "WooCommerce item")[:255],
                    quantity=quantity,
                    unit_price=unit_price,
                    line_total=line_total,
                )
            )

        session.add(
            ExternalOrder(
                order_id=order.id,
                external_system=source,
                external_order_id=external_id,
                raw_event_metadata=event_metadata,
            )
        )
        await session.commit()
        return order.id, True
    except IntegrityError:
        await session.rollback()
        duplicate_id = await session.scalar(
            select(ExternalOrder.order_id).where(
                ExternalOrder.external_system == source,
                ExternalOrder.external_order_id == external_id,
            )
        )
        if duplicate_id is not None:
            return duplicate_id, False
        raise


async def _find_local_product(
    session: AsyncSession,
    source: str,
    external_product_id: int | None,
    sku: str | None,
) -> UUID | None:
    if external_product_id:
        mapped_product_id = await session.scalar(
            select(ExternalProduct.product_id).where(
                ExternalProduct.external_system == source,
                ExternalProduct.external_product_id == str(external_product_id),
            )
        )
        if mapped_product_id is not None:
            return mapped_product_id

    if sku:
        return await session.scalar(select(Product.id).where(Product.sku == sku))
    return None
