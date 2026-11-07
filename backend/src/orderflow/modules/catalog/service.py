from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from orderflow.modules.catalog.models import Product
from orderflow.modules.catalog.schemas import ProductCreate, ProductUpdate


class ProductSkuConflictError(Exception):
    pass


async def list_products(session: AsyncSession) -> list[Product]:
    products = await session.scalars(
        select(Product).order_by(Product.created_at.desc())
    )
    return list(products)


async def get_product(session: AsyncSession, product_id: UUID) -> Product | None:
    return await session.get(Product, product_id)


async def create_product(
    session: AsyncSession,
    product_data: ProductCreate,
) -> Product:
    await _ensure_sku_is_available(session, product_data.sku)

    product = Product(**product_data.model_dump())
    session.add(product)
    return await _commit_product(session, product)


async def update_product(
    session: AsyncSession,
    product: Product,
    product_data: ProductUpdate,
) -> Product:
    changes = product_data.model_dump(exclude_none=True)
    if "sku" in changes and changes["sku"] != product.sku:
        await _ensure_sku_is_available(session, changes["sku"], product.id)

    for field_name, value in changes.items():
        setattr(product, field_name, value)

    return await _commit_product(session, product)


async def _ensure_sku_is_available(
    session: AsyncSession,
    sku: str,
    product_id: UUID | None = None,
) -> None:
    statement = select(Product.id).where(Product.sku == sku)
    if product_id is not None:
        statement = statement.where(Product.id != product_id)

    existing_product_id = await session.scalar(statement)
    if existing_product_id is not None:
        raise ProductSkuConflictError


async def _commit_product(
    session: AsyncSession,
    product: Product,
) -> Product:
    try:
        await session.commit()
    except IntegrityError as error:
        await session.rollback()
        raise ProductSkuConflictError from error

    await session.refresh(product)
    return product
