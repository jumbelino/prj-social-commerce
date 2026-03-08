from typing import ClassVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class MercadoPagoPaymentCreateRequest(BaseModel):
    order_id: UUID


class MercadoPagoPreferenceCreateRequest(BaseModel):
    order_id: UUID


class MercadoPagoPixPaymentResponse(BaseModel):
    model_config: ClassVar[ConfigDict] = ConfigDict(from_attributes=True)

    payment_id: str
    status: str
    qr_code: str | None
    qr_code_base64: str | None
    ticket_url: str | None
    external_reference: str | None


class MercadoPagoPreferenceResponse(BaseModel):
    preference_id: str
    init_point: str
    sandbox_init_point: str
