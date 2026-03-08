# pyright: reportMissingImports=false

from collections.abc import Mapping
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.integrations.mercado_pago import (
    MercadoPagoClient,
    MercadoPagoError,
    read_mercado_pago_access_token,
    read_mercado_pago_webhook_secret,
    verify_mercado_pago_webhook_signature,
)
from app.models.order import Order
from app.models.payment import Payment

webhooks_router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@webhooks_router.post("/mercado-pago")
async def mercado_pago_webhook(
    request: Request,
    db: Annotated[Session, Depends(get_db_session)],
    x_signature: Annotated[str | None, Header(alias="x-signature")] = None,
    x_request_id: Annotated[str | None, Header(alias="x-request-id")] = None,
    data_id: Annotated[str | None, Query(alias="data.id")] = None,
) -> dict[str, str]:
    resolved_data_id = data_id
    if resolved_data_id is None:
        try:
            payload = await request.json()
        except Exception:
            payload = None

        if isinstance(payload, Mapping):
            payload_data = payload.get("data")
            if isinstance(payload_data, Mapping):
                payload_data_id = payload_data.get("id")
                if payload_data_id is not None:
                    payload_data_id_str = str(payload_data_id).strip()
                    if payload_data_id_str != "":
                        resolved_data_id = payload_data_id_str

    if x_signature is None or x_request_id is None or resolved_data_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid webhook signature")

    try:
        webhook_secret = read_mercado_pago_webhook_secret()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    is_valid = verify_mercado_pago_webhook_signature(
        signature_header=x_signature,
        request_id=x_request_id,
        data_id=resolved_data_id,
        secret=webhook_secret,
    )
    if not is_valid:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="invalid webhook signature")

    try:
        access_token = read_mercado_pago_access_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    client = MercadoPagoClient(access_token=access_token)
    try:
        payment_data = client.get_payment(resolved_data_id)
    except MercadoPagoError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Mercado Pago error ({exc.status_code}): {exc.response_body}",
        ) from exc

    payment = db.execute(
        select(Payment)
        .where(Payment.provider == "mercado_pago")
        .where(Payment.external_id == resolved_data_id)
        .with_for_update()
    ).scalar_one_or_none()

    mp_status = str(payment_data.get("status", ""))

    if payment is None:
        external_reference_raw = payment_data.get("external_reference")
        external_reference_uuid: UUID | None = None
        if external_reference_raw is not None:
            try:
                external_reference_uuid = UUID(str(external_reference_raw))
            except (TypeError, ValueError):
                external_reference_uuid = None

        if external_reference_uuid is None:
            return {"status": "ignored"}

        order = db.execute(select(Order).where(Order.id == external_reference_uuid).with_for_update()).scalar_one_or_none()
        if order is None:
            return {"status": "ignored"}

        payment_external_id = payment_data.get("id")
        payment = Payment(
            order_id=order.id,
            provider="mercado_pago",
            status=mp_status,
            external_id=resolved_data_id if payment_external_id is None else str(payment_external_id),
            external_reference=str(order.id),
        )
        db.add(payment)
    else:
        payment.status = str(payment_data.get("status", payment.status))
        db.add(payment)

        order = db.execute(select(Order).where(Order.id == payment.order_id).with_for_update()).scalar_one_or_none()

    if order is not None and mp_status == "approved" and order.status == "pending":
        order.status = "paid"
        db.add(order)

    db.commit()
    return {"status": "ok"}
