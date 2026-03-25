# pyright: reportMissingImports=false

from collections.abc import Iterator
from uuid import uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal, require_admin
from app.integrations.minio_storage import get_minio_storage
from app.models.product import Product, ProductImage


class FakeMinioStorage:
    def __init__(self):
        self.uploaded: list[dict[str, object]] = []
        self.deleted_keys: list[str] = []

    def upload_file(self, *, object_key: str, file_obj: object, content_type: str | None) -> None:
        self.uploaded.append(
            {
                "object_key": object_key,
                "content_type": content_type,
                "file_obj": file_obj,
            }
        )

    def delete_object(self, object_key: str) -> None:
        self.deleted_keys.append(object_key)

    def build_url(self, object_key: str) -> str:
        return f"http://localhost:9000/product-images/{object_key}"


@pytest.fixture(autouse=True)
def override_admin_dependency(client: TestClient) -> Iterator[None]:
    app = client.app
    assert isinstance(app, FastAPI)

    def _require_admin_override() -> Principal:
        return Principal(subject="test-admin", roles=("admin",), is_admin=True, claims={})

    app.dependency_overrides[require_admin] = _require_admin_override
    yield
    app.dependency_overrides.pop(require_admin, None)


@pytest.fixture
def fake_storage(client: TestClient) -> Iterator[FakeMinioStorage]:
    app = client.app
    assert isinstance(app, FastAPI)

    storage = FakeMinioStorage()
    app.dependency_overrides[get_minio_storage] = lambda: storage
    yield storage
    app.dependency_overrides.pop(get_minio_storage, None)


def _seed_product(db_session: Session) -> Product:
    product = Product(
        title=f"Image Product {uuid4()}",
        description="admin image tests",
        active=True,
    )
    db_session.add(product)
    db_session.commit()
    db_session.refresh(product)
    return product


def test_upload_creates_image_and_increments_position(
    client: TestClient,
    db_session: Session,
    fake_storage: FakeMinioStorage,
) -> None:
    product = _seed_product(db_session)
    db_session.add(
        ProductImage(
            product_id=product.id,
            object_key=f"products/{product.id}/existing-0.jpg",
            url=f"http://localhost:9000/product-images/products/{product.id}/existing-0.jpg",
            position=0,
        )
    )
    db_session.add(
        ProductImage(
            product_id=product.id,
            object_key=f"products/{product.id}/existing-1.jpg",
            url=f"http://localhost:9000/product-images/products/{product.id}/existing-1.jpg",
            position=1,
        )
    )
    db_session.commit()

    response = client.post(
        f"/admin/products/{product.id}/images/upload",
        files={"file": ("new-image.png", b"test-image-bytes", "image/png")},
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["product_id"] == str(product.id)
    assert payload["position"] == 2
    assert payload["object_key"].startswith(f"products/{product.id}/")
    assert payload["object_key"].endswith(".png")
    assert payload["url"].endswith(payload["object_key"])
    # Lock the URL contract: url must be exactly build_url(object_key)
    assert payload["url"] == fake_storage.build_url(payload["object_key"])

    assert len(fake_storage.uploaded) == 1
    assert fake_storage.uploaded[0]["object_key"] == payload["object_key"]
    assert fake_storage.uploaded[0]["content_type"] == "image/png"

    images = db_session.execute(
        select(ProductImage).where(ProductImage.product_id == product.id).order_by(ProductImage.position.asc())
    ).scalars().all()
    assert len(images) == 3
    assert [image.position for image in images] == [0, 1, 2]
    assert images[2].object_key == payload["object_key"]


def test_upload_rejects_when_product_reaches_max_images(
    client: TestClient,
    db_session: Session,
    fake_storage: FakeMinioStorage,
) -> None:
    product = _seed_product(db_session)
    for idx in range(10):
        db_session.add(
            ProductImage(
                product_id=product.id,
                object_key=f"products/{product.id}/existing-{idx}.jpg",
                url=f"http://localhost:9000/product-images/products/{product.id}/existing-{idx}.jpg",
                position=idx,
            )
        )
    db_session.commit()

    response = client.post(
        f"/admin/products/{product.id}/images/upload",
        files={"file": ("new-image.png", b"test-image-bytes", "image/png")},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "maximum of 10 images per product reached"
    assert len(fake_storage.uploaded) == 0

    images = db_session.execute(
        select(ProductImage).where(ProductImage.product_id == product.id)
    ).scalars().all()
    assert len(images) == 10


@pytest.mark.parametrize(
    "requested_ids",
    [
        [1],
        [1, 2, 999],
    ],
)
def test_reorder_rejects_missing_or_extra_ids(
    client: TestClient,
    db_session: Session,
    requested_ids: list[int],
) -> None:
    product = _seed_product(db_session)
    image_a = ProductImage(
        product_id=product.id,
        object_key=f"products/{product.id}/a.jpg",
        url=f"http://localhost:9000/product-images/products/{product.id}/a.jpg",
        position=0,
    )
    image_b = ProductImage(
        product_id=product.id,
        object_key=f"products/{product.id}/b.jpg",
        url=f"http://localhost:9000/product-images/products/{product.id}/b.jpg",
        position=1,
    )
    db_session.add(image_a)
    db_session.add(image_b)
    db_session.commit()

    image_ids_in_order = [image_a.id if image_id == 1 else image_b.id if image_id == 2 else image_id for image_id in requested_ids]

    response = client.patch(
        f"/admin/products/{product.id}/images/reorder",
        json={"image_ids_in_order": image_ids_in_order},
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "image_ids_in_order must contain exactly the current product image IDs"

    db_session.expire_all()
    persisted = db_session.execute(
        select(ProductImage).where(ProductImage.product_id == product.id).order_by(ProductImage.position.asc())
    ).scalars().all()
    assert [image.position for image in persisted] == [0, 1]
