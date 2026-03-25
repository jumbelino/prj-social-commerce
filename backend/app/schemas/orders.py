from datetime import datetime
from typing import ClassVar, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.enums import DeliveryMethod, OrderStatus


class OrderItemCreate(BaseModel):
    variant_id: UUID
    quantity: int = Field(ge=1)


class OrderShippingSelection(BaseModel):
    provider: Literal["melhor_envio"]
    service_id: int
    service_name: str
    delivery_days: int
    price_cents: int
    from_postal_code: str | None = Field(default=None)
    to_postal_code: str = Field(pattern=r"^\d{8}$")
    quote_json: dict[str, object] | None = Field(default=None)

    @field_validator("from_postal_code")
    @classmethod
    def validate_from_postal_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if normalized == "":
            return None
        if not normalized.isdigit() or len(normalized) != 8:
            raise ValueError("from_postal_code must have exactly 8 digits")
        return normalized


class OrderCreate(BaseModel):
    delivery_method: DeliveryMethod = DeliveryMethod.SHIPPING
    customer_name: str | None = Field(default=None, max_length=255)
    customer_email: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=40)
    items: list[OrderItemCreate] = Field(min_length=1)
    shipping: OrderShippingSelection | None = None

    @model_validator(mode="after")
    def validate_delivery_method(self) -> "OrderCreate":
        if self.delivery_method == DeliveryMethod.SHIPPING and self.shipping is None:
            raise ValueError("shipping is required when delivery_method is shipping")
        if self.delivery_method == DeliveryMethod.PICKUP and self.shipping is not None:
            raise ValueError("shipping must be omitted when delivery_method is pickup")
        return self


class OrderItemRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: int
    order_id: UUID
    variant_id: UUID
    quantity: int
    unit_price_cents: int
    total_cents: int


class OrderRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    delivery_method: DeliveryMethod
    customer_id: int | None
    customer_name: str | None
    customer_email: str | None
    customer_phone: str | None
    source: str
    subtotal_cents: int
    shipping_cents: int
    shipping_provider: str | None
    shipping_service_id: int | None
    shipping_service_name: str | None
    shipping_delivery_days: int | None
    shipping_from_postal_code: str | None
    shipping_to_postal_code: str | None
    shipping_quote_json: dict[str, object] | None
    total_cents: int
    expires_at: datetime | None
    inventory_released_at: datetime | None
    latest_payment_status: str | None
    latest_payment_external_id: str | None
    created_at: datetime
    items: list[OrderItemRead]


class OrderStatusUpdate(BaseModel):
    status: OrderStatus

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, value: str | OrderStatus) -> OrderStatus:
        if isinstance(value, str):
            try:
                return OrderStatus(value)
            except ValueError:
                valid = [s.value for s in OrderStatus]
                raise ValueError(f"invalid status. Allowed: {', '.join(valid)}")
        return value
