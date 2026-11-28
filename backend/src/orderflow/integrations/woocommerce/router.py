import hashlib

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import SecretStr, ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from orderflow.integrations.woocommerce.adapter import (
    WooCommerceAPIError,
    WooCommerceAdapter,
    get_store_source_key,
)
from orderflow.integrations.woocommerce.schemas import WooOrder
from orderflow.integrations.woocommerce.security import verify_webhook_signature
from orderflow.integrations.woocommerce.service import (
    WooCommerceSyncConflictError,
    receive_order,
    sync_products,
)
from orderflow.modules.identity.dependencies import require_roles
from orderflow.shared.config import get_settings
from orderflow.shared.db.session import get_db_session


router = APIRouter(tags=["woocommerce"])
admin_access = require_roles("ADMIN")


def _secret_value(value: SecretStr | None) -> str | None:
    if value is None:
        return None
    secret = value.get_secret_value().strip()
    return secret or None


def get_woocommerce_adapter() -> WooCommerceAdapter:
    settings = get_settings()
    base_url = (settings.woocommerce_base_url or "").strip()
    consumer_key = _secret_value(settings.woocommerce_consumer_key)
    consumer_secret = _secret_value(settings.woocommerce_consumer_secret)
    if not base_url or not consumer_key or not consumer_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WooCommerce API credentials are not configured",
        )
    try:
        get_store_source_key(base_url)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WooCommerce base URL is invalid",
        ) from error
    return WooCommerceAdapter(base_url, consumer_key, consumer_secret)


@router.post("/integrations/woocommerce/sync/products")
async def post_sync_products(
    session: AsyncSession = Depends(get_db_session),
    _: object = Depends(admin_access),
) -> dict[str, object]:
    adapter = get_woocommerce_adapter()
    source = get_store_source_key(adapter.base_url)
    try:
        products = await adapter.fetch_products()
        counts = await sync_products(session, source, products)
    except WooCommerceAPIError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    except WooCommerceSyncConflictError as error:
        raise HTTPException(
            status_code=409,
            detail="WooCommerce products conflict with the local catalog",
        ) from error

    return {"source": source, **counts}


@router.post("/webhooks/woocommerce/order-created")
async def post_order_created_webhook(
    request: Request,
    session: AsyncSession = Depends(get_db_session),
) -> JSONResponse:
    settings = get_settings()
    base_url = (settings.woocommerce_base_url or "").strip()
    webhook_secret = _secret_value(settings.woocommerce_webhook_secret)
    if not base_url or not webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WooCommerce webhook is not configured",
        )
    try:
        source = get_store_source_key(base_url)
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="WooCommerce base URL is invalid",
        ) from error

    body = await request.body()
    signature = request.headers.get("X-WC-Webhook-Signature")
    if not verify_webhook_signature(body, signature, webhook_secret):
        raise HTTPException(status_code=401, detail="Invalid WooCommerce webhook signature")

    topic = request.headers.get("X-WC-Webhook-Topic")
    if topic and topic != "order.created":
        raise HTTPException(status_code=400, detail="Unexpected WooCommerce webhook topic")

    try:
        payload = WooOrder.model_validate_json(body)
    except ValidationError as error:
        raise HTTPException(status_code=422, detail="Invalid WooCommerce order payload") from error

    event_metadata = {
        "body_sha256": hashlib.sha256(body).hexdigest(),
        "webhook_id": request.headers.get("X-WC-Webhook-ID", "")[:100],
        "topic": request.headers.get("X-WC-Webhook-Topic", "")[:100],
        "resource": request.headers.get("X-WC-Webhook-Resource", "")[:100],
        "event": request.headers.get("X-WC-Webhook-Event", "")[:100],
    }
    try:
        order_id, created = await receive_order(session, source, payload, event_metadata)
    except ValueError as error:
        raise HTTPException(status_code=422, detail="Invalid order amount") from error

    return JSONResponse(
        status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        content={
            "order_id": str(order_id),
            "external_order_id": str(payload.id),
            "created": created,
        },
    )
