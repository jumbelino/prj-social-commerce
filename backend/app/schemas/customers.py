from datetime import datetime
from typing import ClassVar

from pydantic import BaseModel, ConfigDict, Field

from ..schemas.orders import OrderRead


class CustomerRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None
    phone: str | None
    created_at: datetime
    total_orders: int = 0


class CustomerCreate(BaseModel):
    name: str | None = Field(default=None, max_length=255)
    email: str | None = Field(default=None, max_length=255)
    phone: str | None = Field(default=None, max_length=40)


class CustomerWithOrders(CustomerRead):
    orders: list[OrderRead]
