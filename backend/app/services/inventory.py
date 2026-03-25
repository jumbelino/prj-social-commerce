from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Order, OrderItem
from app.models.product import ProductVariant

ORDER_EXPIRATION_MINUTES = 30
FINAL_PAYMENT_STATUSES = {"cancelled", "charged_back", "expired", "refunded", "rejected"}


def default_order_expiration() -> datetime:
    return datetime.now(timezone.utc) + timedelta(minutes=ORDER_EXPIRATION_MINUTES)


def release_inventory_for_order(db: Session, order: Order) -> bool:
    if order.inventory_released_at is not None:
        return False

    order_items = db.execute(
        select(OrderItem)
        .where(OrderItem.order_id == order.id)
        .order_by(OrderItem.id.asc())
        .with_for_update()
    ).scalars().all()

    if not order_items:
        order.inventory_released_at = datetime.now(timezone.utc)
        db.add(order)
        return True

    variant_ids = sorted({item.variant_id for item in order_items}, key=str)
    variants = db.execute(
        select(ProductVariant)
        .where(ProductVariant.id.in_(variant_ids))
        .order_by(ProductVariant.id.asc())
        .with_for_update()
    ).scalars().all()
    variants_by_id = {variant.id: variant for variant in variants}

    for item in order_items:
        variant = variants_by_id.get(item.variant_id)
        if variant is None:
            continue
        variant.stock += item.quantity
        db.add(variant)

    order.inventory_released_at = datetime.now(timezone.utc)
    db.add(order)
    return True


def expire_order_if_needed(db: Session, order: Order) -> bool:
    if order.status != "pending":
        return False
    if order.expires_at is None:
        return False
    if order.expires_at > datetime.now(timezone.utc):
        return False

    order.status = "cancelled"
    release_inventory_for_order(db, order)
    db.add(order)
    return True


def sync_order_with_payment_status(db: Session, order: Order, payment_status: str | None) -> None:
    normalized_status = "" if payment_status is None else payment_status.strip().lower()
    if normalized_status == "":
        return

    if normalized_status == "approved":
        if order.status == "pending":
            order.status = "paid"
            db.add(order)
        return

    if normalized_status in FINAL_PAYMENT_STATUSES:
        if order.status in {"pending", "paid"}:
            order.status = "cancelled"
        release_inventory_for_order(db, order)
        db.add(order)
