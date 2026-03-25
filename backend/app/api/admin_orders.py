# pyright: reportMissingImports=false

from datetime import date, timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.dependencies import Principal, require_admin
from ..db.session import get_db_session
from ..integrations.melhor_envio import read_shipping_origin_postal_code
from ..models.order import Order
from ..schemas.enums import DeliveryMethod, OrderStatus
from ..schemas.orders import OrderCreate, OrderRead, OrderStatusUpdate
from ..services import create_order_from_payload, expire_order_if_needed, release_inventory_for_order

admin_orders_router = APIRouter(prefix="/admin/orders", tags=["admin-orders"])


@admin_orders_router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_admin_order(
    payload: OrderCreate,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> Order:
    """Create an order on behalf of a customer (assisted sale)."""
    shipping_from_postal_code: str | None = None
    if payload.delivery_method == DeliveryMethod.SHIPPING:
        shipping = payload.shipping
        if shipping is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="shipping is required when delivery_method is shipping",
            )
        shipping_from_postal_code = shipping.from_postal_code
        if shipping_from_postal_code is None:
            try:
                shipping_from_postal_code = read_shipping_origin_postal_code()
            except RuntimeError as exc:
                raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    return create_order_from_payload(
        db,
        payload=payload,
        source="admin_assisted",
        shipping_from_postal_code=shipping_from_postal_code,
    )


@admin_orders_router.get("", response_model=list[OrderRead])
def list_admin_orders(
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
    status: str | None = None,
    source: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Order]:
    stmt = select(Order).options(selectinload(Order.items), selectinload(Order.payments))
    if status:
        stmt = stmt.where(Order.status == status)
    if source:
        stmt = stmt.where(Order.source == source)
    if start_date is not None:
        stmt = stmt.where(Order.created_at >= start_date)
    if end_date is not None:
        stmt = stmt.where(Order.created_at < (end_date + timedelta(days=1)))
    stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    orders = db.execute(stmt).scalars().all()
    mutated = False
    for order in orders:
        mutated = expire_order_if_needed(db, order) or mutated
    if mutated:
        db.commit()
        for order in orders:
            db.refresh(order)
    return orders


@admin_orders_router.get("/{order_id}", response_model=OrderRead)
def get_admin_order(
    order_id: UUID,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> Order:
    stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .where(Order.id == order_id)
    )
    order = db.execute(stmt).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    if expire_order_if_needed(db, order):
        db.commit()
        db.refresh(order)
    return order


@admin_orders_router.patch("/{order_id}", response_model=OrderRead)
def update_admin_order(
    order_id: UUID,
    payload: OrderStatusUpdate,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> Order:
    stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .where(Order.id == order_id)
    )
    order = db.execute(stmt).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    new_status = payload.status
    current_status = OrderStatus(order.status) if order.status in [s.value for s in OrderStatus] else None

    if current_status is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid current status: {order.status}",
        )

    allowed_from_current = OrderStatus.valid_transitions().get(current_status, [])
    if not allowed_from_current:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"cannot change status of order in '{current_status.value}' state",
        )

    if new_status not in allowed_from_current:
        allowed_str = ", ".join(s.value for s in allowed_from_current)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid transition from '{current_status.value}' to '{new_status.value}'. Allowed: {allowed_str}",
        )

    order.status = new_status.value
    if new_status == OrderStatus.CANCELLED and current_status in {OrderStatus.PENDING, OrderStatus.PAID}:
        release_inventory_for_order(db, order)
    db.commit()
    db.refresh(order)
    return order
