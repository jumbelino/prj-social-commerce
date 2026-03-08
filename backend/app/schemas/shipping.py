from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ShippingQuoteItemCreate(BaseModel):
    variant_id: UUID
    quantity: int = Field(ge=1)


class ShippingQuoteCreate(BaseModel):
    to_postal_code: str = Field(pattern=r"^\d{8}$")
    items: list[ShippingQuoteItemCreate] = Field(min_length=1)


class ShippingQuoteOptionRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    service_id: int
    name: str
    price_cents: int
    delivery_days: int
    raw_json: dict[str, object]


class ShippingQuoteResponse(BaseModel):
    options: list[ShippingQuoteOptionRead]
