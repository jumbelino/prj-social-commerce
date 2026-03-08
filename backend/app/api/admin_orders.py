# pyright: reportMissingImports=false

from collections import defaultdict
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth.dependencies import Principal, require_admin
from ..db.session import get_db_session
from ..integrations.melhor_envio import read_shipping_origin_postal_code
from ..models.order import Order, OrderItem
from ..models.product import ProductVariant
from ..schemas.orders import OrderCreate, OrderRead

admin_orders_router = APIRouter(prefix="/admin/orders", tags=["admin-orders"])


@admin_orders_router.post("", response_model=OrderRead, status_code=status.HTTP_201_CREATED)
def create_admin_order(
    payload: OrderCreate,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> Order:
    """Create an order on behalf of a customer (assisted sale)."""
    requested_quantities: dict[UUID, int] = defaultdict(int)
    for item in payload.items:
        requested_quantities[item.variant_id] += item.quantity

    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(list(requested_quantities.keys())))
        .order_by(ProductVariant.id)
        .with_for_update()
    )
    variants = db.execute(stmt).scalars().all()
    variants_by_id = {variant.id: variant for variant in variants}

    missing_variant_ids = sorted(
        (variant_id for variant_id in requested_quantities if variant_id not in variants_by_id),
        key=str,
    )
    if missing_variant_ids:
        missing_ids_str = ", ".join(str(variant_id) for variant_id in missing_variant_ids)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"variant not found: {missing_ids_str}",
        )

    for variant_id in sorted(requested_quantities.keys(), key=str):
        requested = requested_quantities[variant_id]
        variant = variants_by_id[variant_id]
        if variant.stock < requested:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"insufficient stock for variant {variant_id}: "
                    f"requested {requested}, available {variant.stock}"
                ),
            )

    shipping_from_postal_code = payload.shipping.from_postal_code
    if shipping_from_postal_code is None:
        try:
            shipping_from_postal_code = read_shipping_origin_postal_code()
        except RuntimeError as exc:
            raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    shipping_cents = payload.shipping.price_cents

    order = Order(
        status="pending",
        customer_name=payload.customer_name,
        customer_email=payload.customer_email,
        customer_phone=payload.customer_phone,
        source="admin_assisted",
        subtotal_cents=0,
        shipping_cents=shipping_cents,
        shipping_provider=payload.shipping.provider,
        shipping_service_id=payload.shipping.service_id,
        shipping_service_name=payload.shipping.service_name,
        shipping_delivery_days=payload.shipping.delivery_days,
        shipping_from_postal_code=shipping_from_postal_code,
        shipping_to_postal_code=payload.shipping.to_postal_code,
        shipping_quote_json=payload.shipping.quote_json,
        total_cents=0,
    )
    db.add(order)
    db.flush()

    subtotal_cents = 0
    for variant_id in sorted(requested_quantities.keys(), key=str):
        quantity = requested_quantities[variant_id]
        variant = variants_by_id[variant_id]
        unit_price_cents = variant.price_cents
        item_total_cents = unit_price_cents * quantity
        subtotal_cents += item_total_cents

        variant.stock -= quantity
        db.add(
            OrderItem(
                order_id=order.id,
                variant_id=variant_id,
                quantity=quantity,
                unit_price_cents=unit_price_cents,
                total_cents=item_total_cents,
            )
        )

    order.subtotal_cents = subtotal_cents
    order.total_cents = subtotal_cents + shipping_cents
    db.commit()

    created_stmt = select(Order).options(selectinload(Order.items)).where(Order.id == order.id)
    created_order = db.execute(created_stmt).scalar_one()
    return created_order


@admin_orders_router.get("", response_model=list[OrderRead])
def list_admin_orders(
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
    status: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[Order]:
    stmt = select(Order).options(selectinload(Order.items))
    if status:
        stmt = stmt.where(Order.status == status)
    stmt = stmt.order_by(Order.created_at.desc()).limit(limit).offset(offset)
    orders = db.execute(stmt).scalars().all()
    return orders


@admin_orders_router.get("/{order_id}", response_model=OrderRead)
def get_admin_order(
    order_id: UUID,
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> Order:
    stmt = select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    order = db.execute(stmt).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")
    return order


@admin_orders_router.patch("/{order_id}", response_model=OrderRead)
def update_admin_order(
    order_id: UUID,
    payload: dict[str, str],
    db: Annotated[Session, Depends(get_db_session)],
    principal: Annotated[Principal, Depends(require_admin)],
) -> Order:
    stmt = select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    order = db.execute(stmt).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="order not found")

    new_status = payload.get("status")
    if not new_status:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="status is required")

    allowed_statuses = {"pending", "paid", "shipped", "delivered", "cancelled"}
    if new_status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"invalid status. Allowed: {', '.join(allowed_statuses)}",
        )

    if order.status == "cancelled" and new_status != "cancelled":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="cannot change status of cancelled order",
        )

    order.status = new_status
    db.commit()
    return order
