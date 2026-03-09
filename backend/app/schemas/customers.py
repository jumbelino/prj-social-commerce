from typing import ClassVar

from pydantic import BaseModel, ConfigDict

from ..schemas.orders import OrderRead


class CustomerRead(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str | None
    phone: str | None


class CustomerWithOrders(CustomerRead):
    orders: list[OrderRead]
    total_orders: int
