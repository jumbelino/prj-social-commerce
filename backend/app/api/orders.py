# pyright: reportMissingImports=false

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..db.session import get_db_session
from ..integrations.melhor_envio import read_shipping_origin_postal_code
from ..models.order import Order
from ..schemas.enums import DeliveryMethod
from ..schemas.orders import OrderCreate, OrderRead
from ..services import create_order_from_payload, expire_order_if_needed

orders_router = APIRouter(prefix="/orders", tags=["orders"])


@orders_router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_order(
    payload: OrderCreate,
    db: Annotated[Session, Depends(get_db_session)],
) -> Order:
    if payload.delivery_method != DeliveryMethod.SHIPPING:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="storefront orders currently support only shipping delivery_method",
        )

    shipping_from_postal_code: str | None = None
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
        source="storefront",
        shipping_from_postal_code=shipping_from_postal_code,
    )


@orders_router.get("/{order_id}", response_model=OrderRead)
def get_order(
    order_id: UUID,
    db: Annotated[Session, Depends(get_db_session)],
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
