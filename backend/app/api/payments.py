# pyright: reportMissingImports=false, reportAttributeAccessIssue=false

from collections.abc import Mapping
import os
from typing import Annotated
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..db.session import get_db_session
from ..integrations.mercado_pago import (
    MercadoPagoClient,
    MercadoPagoError,
    is_mercado_pago_sandbox_enabled,
    read_mercado_pago_access_token,
)
from ..models.order import Order, OrderItem
from ..models.payment import Payment
from ..schemas.orders import OrderRead
from ..schemas.payments import (
    MercadoPagoPaymentCreateRequest,
    MercadoPagoPixPaymentResponse,
    MercadoPagoPreferenceCreateRequest,
    MercadoPagoPreferenceResponse,
    MercadoPagoPaymentSyncRequest,
)
from ..services import expire_order_if_needed, load_order_with_items, sync_order_with_payment_status

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


def _append_query_params(url: str, params: Mapping[str, str]) -> str:
    parsed = urlsplit(url)
    query_items = dict(parse_qsl(parsed.query, keep_blank_values=True))
    query_items.update(params)
    return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(query_items), parsed.fragment))


def _build_checkout_back_urls(order: Order, return_url_base: str) -> dict[str, str]:
    normalized_base = return_url_base.strip()
    base_params = {"order_id": str(order.id)}
    return {
        "success": _append_query_params(normalized_base, {**base_params, "outcome": "success"}),
        "pending": _append_query_params(normalized_base, {**base_params, "outcome": "pending"}),
        "failure": _append_query_params(normalized_base, {**base_params, "outcome": "failure"}),
    }


def _upsert_payment_for_order(
    db: Session,
    *,
    order: Order,
    status_value: str,
    external_id: str | None,
) -> Payment:
    payment = db.execute(
        select(Payment)
        .where(Payment.order_id == order.id)
        .where(Payment.provider == "mercado_pago")
        .order_by(Payment.created_at.desc())
    ).scalars().first()
    if payment is None:
        payment = Payment(
            order_id=order.id,
            provider="mercado_pago",
            external_reference=str(order.id),
        )
    payment.status = status_value
    payment.external_id = external_id
    payment.external_reference = str(order.id)
    db.add(payment)
    return payment


def _sync_order_payment(
    db: Session,
    *,
    order_id: UUID,
    payment_id: str | None,
    payment_status: str | None,
    client: MercadoPagoClient,
) -> Order:
    order = db.execute(
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .where(Order.id == order_id)
        .with_for_update()
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    if expire_order_if_needed(db, order):
        db.commit()
        return load_order_with_items(db, order.id)

    remote_status = payment_status
    resolved_payment_id = payment_id
    if payment_id is not None:
        try:
            payment_data = client.get_payment(payment_id)
        except MercadoPagoError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Mercado Pago error ({exc.status_code}): {exc.response_body}",
            ) from exc
        resolved_payment_id = "" if payment_data.get("id") is None else str(payment_data.get("id"))
        remote_status = "" if payment_data.get("status") is None else str(payment_data.get("status"))
    elif payment_status is None:
        return order

    _upsert_payment_for_order(
        db,
        order=order,
        status_value="" if remote_status is None else str(remote_status),
        external_id=resolved_payment_id,
    )
    sync_order_with_payment_status(db, order, remote_status)
    db.commit()
    return load_order_with_items(db, order.id)


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
    if expire_order_if_needed(db, order):
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="order expired before payment creation",
        )
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


@payments_router.post("/mercado-pago/sync", response_model=OrderRead)
def sync_mercado_pago_payment(
    payload: MercadoPagoPaymentSyncRequest,
    db: Annotated[Session, Depends(get_db_session)],
) -> Order:
    try:
        access_token = read_mercado_pago_access_token()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    client = MercadoPagoClient(access_token=access_token)
    return _sync_order_payment(
        db,
        order_id=payload.order_id,
        payment_id=payload.payment_id,
        payment_status=payload.payment_status,
        client=client,
    )


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
    is_sandbox = is_mercado_pago_sandbox_enabled(access_token)

    order = db.execute(select(Order).where(Order.id == payload.order_id).with_for_update()).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    if expire_order_if_needed(db, order):
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="order expired before checkout preference creation",
        )
    if order.status != "pending":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="order is not payable",
        )

    items = _build_checkout_preference_items(db, order)
    back_urls = None if payload.return_url_base is None else _build_checkout_back_urls(order, payload.return_url_base)
    notification_url = os.getenv("MERCADO_PAGO_NOTIFICATION_URL")

    try:
        preference_data = client.create_checkout_preference(
            external_reference=str(order.id),
            items=items,
            payer_email=order.customer_email,
            back_urls=back_urls,
            notification_url=notification_url,
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

    _upsert_payment_for_order(
        db,
        order=order,
        status_value="pending",
        external_id=str(preference_id),
    )
    db.commit()

    return MercadoPagoPreferenceResponse(
        preference_id=str(preference_id),
        init_point=str(init_point),
        sandbox_init_point=str(sandbox_init_point),
        checkout_url=str(sandbox_init_point if is_sandbox else init_point),
        is_sandbox=is_sandbox,
    )
