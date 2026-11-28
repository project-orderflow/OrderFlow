from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class WooCommercePayload(BaseModel):
    model_config = ConfigDict(extra="ignore")


class WooProduct(WooCommercePayload):
    id: int = Field(gt=0)
    sku: str | None = None
    name: str = ""
    price: Decimal | None = None
    status: str = "publish"

    @field_validator("sku", mode="before")
    @classmethod
    def blank_sku_is_missing(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value

    @field_validator("price", mode="before")
    @classmethod
    def blank_price_is_missing(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value


class WooBilling(WooCommercePayload):
    first_name: str = ""
    last_name: str = ""
    email: str | None = None


class WooOrderItem(WooCommercePayload):
    product_id: int | None = None
    variation_id: int | None = None
    sku: str | None = Field(default=None, max_length=100)
    name: str = ""
    quantity: int = Field(default=1, gt=0)
    price: Decimal | None = None
    total: Decimal | None = None

    @field_validator("sku", mode="before")
    @classmethod
    def blank_sku_is_missing(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value

    @field_validator("price", "total", mode="before")
    @classmethod
    def blank_amount_is_missing(cls, value: object) -> object:
        if value is None or (isinstance(value, str) and not value.strip()):
            return None
        return value


class WooOrder(WooCommercePayload):
    id: int = Field(gt=0)
    number: str | None = None
    status: str = "pending"
    currency: str = Field(default="USD", min_length=3, max_length=3)
    total: Decimal
    billing: WooBilling = Field(default_factory=WooBilling)
    line_items: list[WooOrderItem] = Field(default_factory=list)

    @field_validator("currency")
    @classmethod
    def uppercase_currency(cls, value: str) -> str:
        return value.upper()
