# pyright: reportMissingImports=false, reportAttributeAccessIssue=false

from collections.abc import Mapping
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..db.session import get_db_session
from ..integrations.mercado_pago import MercadoPagoClient, MercadoPagoError, read_mercado_pago_access_token
from ..models.order import Order, OrderItem
from ..models.payment import Payment
from ..schemas.payments import (
    MercadoPagoPaymentCreateRequest,
    MercadoPagoPixPaymentResponse,
    MercadoPagoPreferenceCreateRequest,
    MercadoPagoPreferenceResponse,
)

payments_router = APIRouter(prefix="/payments", tags=["payments"])


def _build_pix_response(payment_data: Mapping[str, object]) -> MercadoPagoPixPaymentResponse:
    point_of_interaction = payment_data.get("point_of_interaction")
    transaction_data: Mapping[str, object] = {}
    if isinstance(point_of_interaction, dict):
        maybe_transaction_data = point_of_interaction.get("transaction_data")
        if isinstance(maybe_transaction_data, dict):
            transaction_data = maybe_transaction_data
    payment_id = payment_data.get("id")
    status_value = payment_data.get("status")
    external_reference = payment_data.get("external_reference")
    return MercadoPagoPixPaymentResponse(
        payment_id="" if payment_id is None else str(payment_id),
        status="" if status_value is None else str(status_value),
        qr_code=None if transaction_data.get("qr_code") is None else str(transaction_data.get("qr_code")),
        qr_code_base64=(
            None
            if transaction_data.get("qr_code_base64") is None
            else str(transaction_data.get("qr_code_base64"))
        ),
        ticket_url=(
            None if transaction_data.get("ticket_url") is None else str(transaction_data.get("ticket_url"))
        ),
        external_reference=None if external_reference is None else str(external_reference),
    )


def _build_response_from_payment(payment: Payment) -> MercadoPagoPixPaymentResponse:
    return MercadoPagoPixPaymentResponse(
        payment_id=payment.external_id or "",
        status=payment.status,
        qr_code=None,
        qr_code_base64=None,
        ticket_url=None,
        external_reference=payment.external_reference,
    )


def _build_checkout_preference_items(db: Session, order: Order) -> list[dict[str, object]]:
    order_items = db.execute(
        select(OrderItem).where(OrderItem.order_id == order.id).order_by(OrderItem.id.asc())
    ).scalars().all()
    items: list[dict[str, object]] = []
    for order_item in order_items:
        items.append(
            {
                "title": f"Item {order_item.variant_id}",
                "currency_id": "BRL",
                "quantity": int(order_item.quantity),
                "unit_price": float(order_item.unit_price_cents / 100),
            }
        )

    if order.shipping_cents > 0:
        items.append(
            {
                "title": "Shipping",
                "currency_id": "BRL",
                "quantity": 1,
                "unit_price": float(order.shipping_cents / 100),
            }
        )

    return items


@payments_router.post("/mercado-pago", response_model=MercadoPagoPixPaymentResponse)
def create_mercado_pago_payment(
    payload: MercadoPagoPaymentCreateRequest,
    db: Annotated[Session, Depends(get_db_session)],
) -> MercadoPagoPixPaymentResponse:
    try:
        access_token = read_mercado_pago_access_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    client = MercadoPagoClient(access_token=access_token)

    order = db.execute(select(Order).where(Order.id == payload.order_id).with_for_update()).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="order is not payable",
        )
    if order.customer_email is None or order.customer_email.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="order customer_email is required for Mercado Pago PIX",
        )

    existing_payment = db.execute(
        select(Payment)
        .where(Payment.order_id == order.id)
        .where(Payment.provider == "mercado_pago")
        .order_by(Payment.created_at.desc())
    ).scalars().first()

    if existing_payment is not None:
        if existing_payment.external_id:
            try:
                payment_data = client.get_payment(existing_payment.external_id)
            except MercadoPagoError as exc:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=f"Mercado Pago error ({exc.status_code}): {exc.response_body}",
                ) from exc

            existing_payment.status = str(payment_data.get("status", existing_payment.status))
            db.add(existing_payment)
            db.commit()
            return _build_pix_response(payment_data)
        return _build_response_from_payment(existing_payment)

    transaction_amount = order.total_cents / 100
    try:
        payment_data = client.create_pix_payment(
            order_id=order.id,
            transaction_amount=transaction_amount,
            payer_email=order.customer_email,
        )
    except MercadoPagoError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Mercado Pago error ({exc.status_code}): {exc.response_body}",
        ) from exc

    persisted_payment = Payment(
        order_id=order.id,
        provider="mercado_pago",
        status=str(payment_data.get("status", "")),
        external_id=None if payment_data.get("id") is None else str(payment_data.get("id")),
        external_reference=str(order.id),
    )
    db.add(persisted_payment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        collided_payment = db.execute(
            select(Payment)
            .where(Payment.order_id == order.id)
            .where(Payment.provider == "mercado_pago")
            .order_by(Payment.created_at.desc())
        ).scalars().first()
        if collided_payment is not None:
            return _build_response_from_payment(collided_payment)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="payment persistence failed",
        )

    return _build_pix_response(payment_data)


@payments_router.post("/mercado-pago/preference", response_model=MercadoPagoPreferenceResponse)
def create_mercado_pago_preference(
    payload: MercadoPagoPreferenceCreateRequest,
    db: Annotated[Session, Depends(get_db_session)],
) -> MercadoPagoPreferenceResponse:
    try:
        access_token = read_mercado_pago_access_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    client = MercadoPagoClient(access_token=access_token)

    order = db.execute(select(Order).where(Order.id == payload.order_id).with_for_update()).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="order is not payable",
        )

    items = _build_checkout_preference_items(db, order)

    try:
        preference_data = client.create_checkout_preference(
            external_reference=str(order.id),
            items=items,
        )
    except MercadoPagoError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Mercado Pago error ({exc.status_code}): {exc.response_body}",
        ) from exc

    preference_id = preference_data.get("id")
    init_point = preference_data.get("init_point")
    sandbox_init_point = preference_data.get("sandbox_init_point")
    if preference_id is None or init_point is None or sandbox_init_point is None:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Mercado Pago preference response missing required fields",
        )

    return MercadoPagoPreferenceResponse(
        preference_id=str(preference_id),
        init_point=str(init_point),
        sandbox_init_point=str(sandbox_init_point),
    )
