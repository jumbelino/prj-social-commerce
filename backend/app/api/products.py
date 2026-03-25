from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session, selectinload

from ..auth import Principal, require_admin
from ..db.session import get_db_session
from ..models.order import OrderItem
from ..models.product import Product, ProductImage, ProductVariant
from ..schemas.products import ProductCreate, ProductRead, ProductUpdate

products_router = APIRouter(prefix="/products", tags=["products"])


@products_router.get("", response_model=list[ProductRead])
def list_products(
    db: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    active: Annotated[bool | None, Query()] = None,
    query: Annotated[str | None, Query(min_length=1)] = None,
) -> list[Product]:
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .order_by(Product.created_at.desc())
    )
    if active is not None:
        stmt = stmt.where(Product.active == active)
    if query is not None and query.strip() != "":
        search_term = f"%{query.strip()}%"
        stmt = stmt.where(
            or_(
                Product.title.ilike(search_term),
                Product.description.ilike(search_term),
                Product.variants.any(ProductVariant.sku.ilike(search_term)),
            )
        )
    stmt = stmt.limit(limit).offset(offset)
    products = db.execute(stmt).scalars().all()
    return list(products)


@products_router.get("/{product_id}", response_model=ProductRead)
def get_product(
    product_id: UUID,
    db: Annotated[Session, Depends(get_db_session)],
) -> Product:
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id == product_id)
    )
    product = db.execute(stmt).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
    return product


@products_router.post("", response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
    payload: ProductCreate,
    db: Annotated[Session, Depends(get_db_session)],
    _principal: Annotated[Principal, Depends(require_admin)],
) -> Product:
    product = Product(
        title=payload.title,
        description=payload.description,
        active=payload.active,
    )
    db.add(product)
    db.flush()

    for variant in payload.variants:
        db.add(
            ProductVariant(
                product_id=product.id,
                sku=variant.sku,
                price_cents=variant.price_cents,
                attributes_json=variant.attributes_json,
                stock=variant.stock,
                weight_kg=variant.weight_kg,
                width_cm=variant.width_cm,
                height_cm=variant.height_cm,
                length_cm=variant.length_cm,
            )
        )

    for image in payload.images:
        db.add(
            ProductImage(
                product_id=product.id,
                object_key=image.object_key,
                url=image.url,
                position=image.position,
            )
        )

    db.commit()
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id == product.id)
    )
    created = db.execute(stmt).scalar_one()
    return created


@products_router.put("/{product_id}", response_model=ProductRead)
def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    db: Annotated[Session, Depends(get_db_session)],
    _principal: Annotated[Principal, Depends(require_admin)],
) -> Product:
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id == product_id)
    )
    product = db.execute(stmt).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")

    if payload.title is not None:
        product.title = payload.title
    if payload.description is not None:
        product.description = payload.description
    if payload.active is not None:
        product.active = payload.active

    if payload.variants is not None:
        existing_by_id = {variant.id: variant for variant in product.variants}
        existing_by_sku = {variant.sku: variant for variant in product.variants}
        retained_variant_ids: set[UUID] = set()

        for variant_data in payload.variants:
            existing: ProductVariant | None = None
            if variant_data.id is not None:
                existing = existing_by_id.get(variant_data.id)
            elif variant_data.sku:
                existing = existing_by_sku.get(variant_data.sku)

            if existing is not None:
                retained_variant_ids.add(existing.id)
                if variant_data.sku is not None:
                    existing.sku = variant_data.sku
                if variant_data.price_cents is not None:
                    existing.price_cents = variant_data.price_cents
                if variant_data.attributes_json is not None:
                    existing.attributes_json = variant_data.attributes_json
                if variant_data.stock is not None:
                    existing.stock = variant_data.stock
                if variant_data.weight_kg is not None:
                    existing.weight_kg = variant_data.weight_kg
                if variant_data.width_cm is not None:
                    existing.width_cm = variant_data.width_cm
                if variant_data.height_cm is not None:
                    existing.height_cm = variant_data.height_cm
                if variant_data.length_cm is not None:
                    existing.length_cm = variant_data.length_cm
                db.add(existing)
            elif variant_data.sku:
                new_variant = ProductVariant(
                    product_id=product.id,
                    sku=variant_data.sku,
                    price_cents=variant_data.price_cents or 0,
                    attributes_json=variant_data.attributes_json or {},
                    stock=variant_data.stock or 0,
                    weight_kg=variant_data.weight_kg,
                    width_cm=variant_data.width_cm,
                    height_cm=variant_data.height_cm,
                    length_cm=variant_data.length_cm,
                )
                db.add(new_variant)
                db.flush()
                retained_variant_ids.add(new_variant.id)
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="variant id or sku is required for product update",
                )

        for existing in product.variants:
            if existing.id in retained_variant_ids:
                continue
            sold_variant = db.execute(
                select(OrderItem.id)
                .where(OrderItem.variant_id == existing.id)
                .limit(1)
            ).scalar_one_or_none()
            if sold_variant is not None:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"cannot remove sold variant {existing.id}",
                )
            db.delete(existing)

    db.commit()
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .where(Product.id == product_id)
    )
    updated = db.execute(stmt).scalar_one()
    return updated


@products_router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: UUID,
    db: Annotated[Session, Depends(get_db_session)],
    _principal: Annotated[Principal, Depends(require_admin)],
) -> None:
    stmt = select(Product).options(selectinload(Product.variants)).where(Product.id == product_id)
    product = db.execute(stmt).scalar_one_or_none()
    if product is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")

    variant_ids = [variant.id for variant in product.variants]
    has_sales = False
    if variant_ids:
        has_sales = (
            db.execute(
                select(OrderItem.id)
                .where(OrderItem.variant_id.in_(variant_ids))
                .limit(1)
            ).scalar_one_or_none()
            is not None
        )

    if has_sales:
        product.active = False
        db.add(product)
        db.commit()
        return None

    db.delete(product)
    db.commit()
