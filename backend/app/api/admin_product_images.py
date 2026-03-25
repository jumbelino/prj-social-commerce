# pyright: reportMissingImports=false, reportArgumentType=false

from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..auth import require_admin
from ..db.session import get_db_session
from ..integrations.minio_storage import MinioStorage, get_minio_storage
from ..models.product import Product, ProductImage
from ..schemas.products import ProductImageRead

admin_product_images_router = APIRouter(
    prefix="/admin/products/{product_id}/images",
    tags=["admin-product-images"],
    dependencies=[Depends(require_admin)],
)

MAX_IMAGES_PER_PRODUCT = 10


class ProductImagesReorderRequest(BaseModel):
    image_ids_in_order: list[int]


def _assert_product_exists(db: Session, product_id: UUID) -> None:
    product_exists = db.execute(select(Product.id).where(Product.id == product_id)).scalar_one_or_none()
    if product_exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")


def _build_object_key(product_id: UUID, filename: str | None) -> str:
    suffix = Path(filename or "").suffix.lower().lstrip(".")
    extension = suffix if suffix != "" else "bin"
    return f"products/{product_id}/{uuid4()}.{extension}"


@admin_product_images_router.post(
    "/upload",
    response_model=ProductImageRead,
    status_code=status.HTTP_201_CREATED,
)
def upload_product_image(
    product_id: UUID,
    file: Annotated[UploadFile, File(...)],
    db: Annotated[Session, Depends(get_db_session)],
    storage: Annotated[MinioStorage, Depends(get_minio_storage)],
) -> ProductImage:
    _assert_product_exists(db, product_id)
    current_count = db.execute(
        select(func.count(ProductImage.id)).where(ProductImage.product_id == product_id)
    ).scalar_one()
    if current_count >= MAX_IMAGES_PER_PRODUCT:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"maximum of {MAX_IMAGES_PER_PRODUCT} images per product reached",
        )

    object_key = _build_object_key(product_id, file.filename)
    storage.upload_file(object_key=object_key, file_obj=file.file, content_type=file.content_type)

    position = db.execute(
        select(func.coalesce(func.max(ProductImage.position), -1) + 1).where(ProductImage.product_id == product_id)
    ).scalar_one()

    image = ProductImage(
        product_id=product_id,
        object_key=object_key,
        url=storage.build_url(object_key),
        position=int(position),
    )
    db.add(image)
    db.commit()
    db.refresh(image)
    return image


@admin_product_images_router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product_image(
    product_id: UUID,
    image_id: int,
    db: Annotated[Session, Depends(get_db_session)],
    storage: Annotated[MinioStorage, Depends(get_minio_storage)],
) -> None:
    image = db.execute(
        select(ProductImage).where(ProductImage.id == image_id).where(ProductImage.product_id == product_id)
    ).scalar_one_or_none()
    if image is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="image not found")

    storage.delete_object(image.object_key)
    db.delete(image)
    db.commit()


@admin_product_images_router.patch("/reorder", response_model=list[ProductImageRead])
def reorder_product_images(
    product_id: UUID,
    payload: ProductImagesReorderRequest,
    db: Annotated[Session, Depends(get_db_session)],
) -> list[ProductImage]:
    _assert_product_exists(db, product_id)

    images = db.execute(select(ProductImage).where(ProductImage.product_id == product_id)).scalars().all()
    current_ids = [image.id for image in images]
    if len(payload.image_ids_in_order) != len(current_ids) or set(payload.image_ids_in_order) != set(current_ids):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="image_ids_in_order must contain exactly the current product image IDs",
        )

    images_by_id = {image.id: image for image in images}
    for position, image_id in enumerate(payload.image_ids_in_order):
        images_by_id[image_id].position = position

    db.commit()

    reordered = db.execute(
        select(ProductImage).where(ProductImage.product_id == product_id).order_by(ProductImage.position.asc())
    ).scalars().all()
    return reordered
