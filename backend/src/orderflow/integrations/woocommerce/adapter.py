from typing import TypeVar
from urllib.parse import urlencode, urlsplit

import httpx
from oauthlib.oauth1 import Client, SIGNATURE_TYPE_QUERY
from pydantic import ValidationError

from orderflow.integrations.woocommerce.schemas import WooOrder, WooProduct


PAGE_SIZE = 100
PayloadModel = TypeVar("PayloadModel", WooProduct, WooOrder)


class WooCommerceAPIError(Exception):
    pass


def get_store_source_key(base_url: str) -> str:
    parsed = urlsplit(base_url.strip())
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.query
        or parsed.fragment
    ):
        raise ValueError("WooCommerce base URL must be an HTTP(S) store URL without credentials")

    host = parsed.hostname.lower()
    if ":" in host:
        host = f"[{host}]"
    try:
        port = parsed.port
    except ValueError as error:
        raise ValueError("WooCommerce base URL has an invalid port") from error
    if port is not None:
        host = f"{host}:{port}"

    path = parsed.path.rstrip("/")
    api_suffix = "/wp-json/wc/v3"
    if path.endswith(api_suffix):
        path = path[: -len(api_suffix)].rstrip("/")
    source = f"woocommerce://{host}{path}"
    if len(source) > 255:
        raise ValueError("WooCommerce store URL is too long")
    return source


def _api_base_url(base_url: str) -> str:
    store_url = base_url.strip().rstrip("/")
    if store_url.endswith("/wp-json/wc/v3"):
        return store_url
    return f"{store_url}/wp-json/wc/v3"


class WooCommerceAdapter:
    def __init__(
        self,
        base_url: str,
        consumer_key: str,
        consumer_secret: str,
        *,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.base_url = base_url
        self._api_base_url = _api_base_url(base_url)
        self._consumer_key = consumer_key
        self._consumer_secret = consumer_secret
        self._auth = (
            httpx.BasicAuth(consumer_key, consumer_secret)
            if urlsplit(base_url.strip()).scheme == "https"
            else None
        )
        self._transport = transport

    async def fetch_products(self) -> list[WooProduct]:
        return await self._fetch_collection("products", WooProduct)

    async def fetch_orders(self) -> list[WooOrder]:
        return await self._fetch_collection("orders", WooOrder)

    async def _resolve_oauth_api_url(
        self,
        client: httpx.AsyncClient,
    ) -> str:
        discovery_url = self._api_base_url.removesuffix("/wc/v3") + "/"

        try:
            response = await client.get(discovery_url)
            response.raise_for_status()

            public_url = response.json()["url"]
            if not isinstance(public_url, str):
                raise ValueError("Invalid store URL")

            get_store_source_key(public_url)
            return _api_base_url(public_url)
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as error:
            raise WooCommerceAPIError(
                "Could not resolve WooCommerce public URL"
            ) from error

    async def _fetch_collection(
        self,
        resource: str,
        model: type[PayloadModel],
    ) -> list[PayloadModel]:
        result: list[PayloadModel] = []
        async with httpx.AsyncClient(
            base_url=f"{self._api_base_url}/",
            auth=self._auth,
            timeout=httpx.Timeout(15.0, connect=5.0),
            transport=self._transport,
        ) as client:
            oauth_client = None
            oauth_api_url = None

            if self._auth is None:
                oauth_api_url = await self._resolve_oauth_api_url(client)
                oauth_client = Client(
                    client_key=self._consumer_key,
                    client_secret=self._consumer_secret,
                    signature_method="HMAC-SHA1",
                    signature_type=SIGNATURE_TYPE_QUERY,
                )

            page = 1
            while True:
                params = {
                    "page": page,
                    "per_page": PAGE_SIZE,
                }

                try:
                    if oauth_client is not None and oauth_api_url is not None:
                        signed_url, _, _ = oauth_client.sign(
                            f"{oauth_api_url}/{resource}?{urlencode(params)}",
                            http_method="GET",
                        )
                        query = urlsplit(signed_url).query
                        response = await client.get(f"{resource}?{query}")
                    else:
                        response = await client.get(resource, params=params)
                except httpx.RequestError as error:
                    raise WooCommerceAPIError("Could not reach the WooCommerce API") from error

                if response.is_error:
                    raise WooCommerceAPIError(
                        f"WooCommerce returned HTTP {response.status_code} for {resource}"
                    )

                try:
                    payload = response.json()
                    if not isinstance(payload, list):
                        raise ValueError("Expected a JSON array")
                    result.extend(model.model_validate(item) for item in payload)
                except (ValueError, ValidationError) as error:
                    raise WooCommerceAPIError(
                        f"WooCommerce returned an invalid {resource} response"
                    ) from error

                total_pages = response.headers.get("X-WP-TotalPages")
                if total_pages is None:
                    total_pages = response.headers.get("X-WC-TotalPages")
                try:
                    last_page = int(total_pages) if total_pages is not None else None
                except ValueError:
                    last_page = None

                if last_page is not None:
                    if page >= last_page:
                        break
                elif len(payload) < PAGE_SIZE:
                    break
                page += 1

        return result
