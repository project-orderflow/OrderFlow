from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from orderflow.modules.catalog.schemas import (
    ProductCreate,
    ProductResponse,
    ProductUpdate,
)
from orderflow.modules.catalog.service import (
    ProductSkuConflictError,
    create_product,
    get_product,
    list_products,
    update_product,
)
from orderflow.modules.identity.dependencies import require_roles
from orderflow.shared.db.session import get_db_session


router = APIRouter(prefix="/products", tags=["products"])
read_product_access = require_roles("ADMIN", "OPERATOR", "WAREHOUSE")
write_product_access = require_roles("ADMIN")


@router.get("", response_model=list[ProductResponse])
async def get_products(
    session: AsyncSession = Depends(get_db_session),
    _: object = Depends(read_product_access),
) -> list[ProductResponse]:
    return await list_products(session)


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product_by_id(
    product_id: UUID,
    session: AsyncSession = Depends(get_db_session),
    _: object = Depends(read_product_access),
) -> ProductResponse:
    product = await get_product(session, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.post(
    "",
    response_model=ProductResponse,
    status_code=status.HTTP_201_CREATED,
)
async def post_product(
    product_data: ProductCreate,
    session: AsyncSession = Depends(get_db_session),
    _: object = Depends(write_product_access),
) -> ProductResponse:
    try:
        return await create_product(session, product_data)
    except ProductSkuConflictError:
        raise HTTPException(status_code=409, detail="SKU already exists")


@router.patch("/{product_id}", response_model=ProductResponse)
async def patch_product(
    product_id: UUID,
    product_data: ProductUpdate,
    session: AsyncSession = Depends(get_db_session),
    _: object = Depends(write_product_access),
) -> ProductResponse:
    product = await get_product(session, product_id)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")

    try:
        return await update_product(session, product, product_data)
    except ProductSkuConflictError:
        raise HTTPException(status_code=409, detail="SKU already exists")
