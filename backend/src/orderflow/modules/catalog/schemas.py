from datetime import datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class ProductCreate(BaseModel):
    sku: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=255)
    price: Decimal = Field(gt=Decimal("0"), max_digits=12, decimal_places=2)
    active: bool = True

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str) -> str:
        normalized_value = value.strip().upper()
        if not normalized_value:
            raise ValueError("SKU must not be blank")
        return normalized_value

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Name must not be blank")
        return normalized_value


class ProductUpdate(BaseModel):
    sku: str | None = Field(default=None, min_length=1, max_length=100)
    name: str | None = Field(default=None, min_length=1, max_length=255)
    price: Decimal | None = Field(
        default=None,
        gt=Decimal("0"),
        max_digits=12,
        decimal_places=2,
    )
    active: bool | None = None

    @field_validator("sku")
    @classmethod
    def normalize_sku(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip().upper()
        if not normalized_value:
            raise ValueError("SKU must not be blank")
        return normalized_value

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized_value = value.strip()
        if not normalized_value:
            raise ValueError("Name must not be blank")
        return normalized_value

    @model_validator(mode="after")
    def require_at_least_one_change(self) -> "ProductUpdate":
        if all(value is None for value in self.model_dump().values()):
            raise ValueError("At least one product field must be provided")
        return self


class ProductResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    sku: str
    name: str
    price: Decimal
    active: bool
    created_at: datetime
    updated_at: datetime
