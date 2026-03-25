from collections import defaultdict
from typing import Literal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.order import Order, OrderItem
from app.models.product import ProductVariant
from app.schemas.enums import DeliveryMethod
from app.schemas.orders import OrderCreate
from app.services.customers import upsert_customer
from app.services.inventory import default_order_expiration


def create_order_from_payload(
    db: Session,
    *,
    payload: OrderCreate,
    source: Literal["storefront", "admin_assisted"],
    shipping_from_postal_code: str | None = None,
) -> Order:
    requested_quantities: dict[UUID, int] = defaultdict(int)
    for item in payload.items:
        requested_quantities[item.variant_id] += item.quantity

    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(list(requested_quantities.keys())))
        .order_by(ProductVariant.id.asc())
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

    customer = upsert_customer(
        db,
        name=payload.customer_name,
        email=payload.customer_email,
        phone=payload.customer_phone,
    )

    shipping = payload.shipping
    shipping_cents = 0
    shipping_provider: str | None = None
    shipping_service_id: int | None = None
    shipping_service_name: str | None = None
    shipping_delivery_days: int | None = None
    shipping_to_postal_code: str | None = None
    shipping_quote_json: dict[str, object] | None = None

    if payload.delivery_method == DeliveryMethod.SHIPPING:
        if shipping is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="shipping is required when delivery_method is shipping",
            )
        if shipping_from_postal_code is None:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="shipping origin postal code is required for shipping orders",
            )

        shipping_cents = shipping.price_cents
        shipping_provider = shipping.provider
        shipping_service_id = shipping.service_id
        shipping_service_name = shipping.service_name
        shipping_delivery_days = shipping.delivery_days
        shipping_to_postal_code = shipping.to_postal_code
        shipping_quote_json = shipping.quote_json
    else:
        shipping_from_postal_code = None

    order = Order(
        status="pending",
        delivery_method=payload.delivery_method.value,
        customer_id=None if customer is None else customer.id,
        customer_name=payload.customer_name if customer is None else customer.name,
        customer_email=payload.customer_email if customer is None else customer.email,
        customer_phone=payload.customer_phone if customer is None else customer.phone,
        source=source,
        subtotal_cents=0,
        shipping_cents=shipping_cents,
        shipping_provider=shipping_provider,
        shipping_service_id=shipping_service_id,
        shipping_service_name=shipping_service_name,
        shipping_delivery_days=shipping_delivery_days,
        shipping_from_postal_code=shipping_from_postal_code,
        shipping_to_postal_code=shipping_to_postal_code,
        shipping_quote_json=shipping_quote_json,
        total_cents=0,
        expires_at=default_order_expiration(),
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
        db.add(variant)
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
    db.add(order)
    db.commit()
    return load_order_with_items(db, order.id)


def load_order_with_items(db: Session, order_id: UUID) -> Order:
    stmt = (
        select(Order)
        .options(selectinload(Order.items), selectinload(Order.payments))
        .where(Order.id == order_id)
    )
    order = db.execute(stmt).scalar_one()
    return order
