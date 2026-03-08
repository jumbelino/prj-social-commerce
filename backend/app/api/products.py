from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..auth import Principal, require_admin
from ..db.session import get_db_session
from ..models.product import Product, ProductImage, ProductVariant
from ..schemas.products import ProductCreate, ProductRead

products_router = APIRouter(prefix="/products", tags=["products"])


@products_router.get("", response_model=list[ProductRead])
def list_products(
    db: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[Product]:
    stmt = (
        select(Product)
        .options(selectinload(Product.variants), selectinload(Product.images))
        .order_by(Product.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    products = db.execute(stmt).scalars().all()
    return products


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
