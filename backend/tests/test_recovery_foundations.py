# pyright: reportMissingImports=false

from collections.abc import Iterator
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import Principal, require_admin
from app.models.customer import Customer
from app.models.order import Order, OrderItem
from app.models.product import Product, ProductVariant


@pytest.fixture(autouse=True)
def override_admin_dependency(client: TestClient) -> Iterator[None]:
    app = client.app
    assert isinstance(app, FastAPI)

    def _require_admin_override() -> Principal:
        return Principal(subject="test-admin", roles=("admin",), is_admin=True, claims={})

    app.dependency_overrides[require_admin] = _require_admin_override
    yield
    app.dependency_overrides.pop(require_admin, None)


def _seed_product_with_variant(
    db_session: Session,
    *,
    stock: int = 10,
    price_cents: int = 1000,
) -> tuple[Product, ProductVariant]:
    product = Product(
        title=f"Recovery Product {uuid4()}",
        description="recovery test product",
        active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"recovery-sku-{uuid4().hex[:12]}",
        price_cents=price_cents,
        attributes_json={"size": "M"},
        stock=stock,
    )
    db_session.add(variant)
    db_session.commit()
    db_session.refresh(product)
    db_session.refresh(variant)
    return product, variant


def _seed_sold_order(
    db_session: Session,
    *,
    variant: ProductVariant,
    quantity: int = 1,
    status: str = "paid",
) -> Order:
    order = Order(
        status=status,
        customer_name="Recovery Buyer",
        customer_email="recovery@example.com",
        customer_phone=None,
        subtotal_cents=variant.price_cents * quantity,
        shipping_cents=0,
        total_cents=variant.price_cents * quantity,
    )
    db_session.add(order)
    db_session.flush()
    db_session.add(
        OrderItem(
            order_id=order.id,
            variant_id=variant.id,
            quantity=quantity,
            unit_price_cents=variant.price_cents,
            total_cents=variant.price_cents * quantity,
        )
    )
    db_session.commit()
    return order


def test_storefront_order_creation_links_customer_record(client: TestClient, db_session: Session) -> None:
    _, variant = _seed_product_with_variant(db_session, stock=5, price_cents=2200)

    response = client.post(
        "/orders",
        json={
            "customer_name": "Cliente Auditado",
            "customer_email": "cliente.auditado@example.com",
            "customer_phone": "+5511999990000",
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 1,
                "service_name": "PAC",
                "delivery_days": 4,
                "price_cents": 900,
                "from_postal_code": "01018020",
                "to_postal_code": "01018020",
                "quote_json": {"id": 1},
            },
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["customer_id"] is not None
    assert payload["expires_at"] is not None

    customer = db_session.execute(
        select(Customer).where(Customer.email == "cliente.auditado@example.com")
    ).scalar_one_or_none()
    assert customer is not None
    assert payload["customer_id"] == customer.id


def test_admin_order_cancellation_releases_reserved_inventory(client: TestClient, db_session: Session) -> None:
    _, variant = _seed_product_with_variant(db_session, stock=6, price_cents=1500)

    order_response = client.post(
        "/orders",
        json={
            "customer_name": "Cancel Buyer",
            "customer_email": "cancel@example.com",
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 1,
                "service_name": "PAC",
                "delivery_days": 4,
                "price_cents": 0,
                "from_postal_code": "01018020",
                "to_postal_code": "01018020",
                "quote_json": {"id": 1},
            },
        },
    )
    assert order_response.status_code == 201
    order_id = order_response.json()["id"]

    cancel_response = client.patch(
        f"/admin/orders/{order_id}",
        json={"status": "cancelled"},
    )

    assert cancel_response.status_code == 200
    assert cancel_response.json()["status"] == "cancelled"
    assert cancel_response.json()["inventory_released_at"] is not None

    db_session.expire_all()
    refreshed_variant = db_session.get(ProductVariant, variant.id)
    assert refreshed_variant is not None
    assert refreshed_variant.stock == 6


def test_expired_order_becomes_cancelled_and_restores_inventory_before_payment(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, variant = _seed_product_with_variant(db_session, stock=4, price_cents=1900)

    order_response = client.post(
        "/orders",
        json={
            "customer_name": "Expired Buyer",
            "customer_email": "expired@example.com",
            "items": [{"variant_id": str(variant.id), "quantity": 3}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 1,
                "service_name": "PAC",
                "delivery_days": 4,
                "price_cents": 0,
                "from_postal_code": "01018020",
                "to_postal_code": "01018020",
                "quote_json": {"id": 1},
            },
        },
    )
    assert order_response.status_code == 201
    order_id = UUID(order_response.json()["id"])

    order = db_session.get(Order, order_id)
    assert order is not None
    order.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    db_session.add(order)
    db_session.commit()

    monkeypatch.setattr("app.api.payments.read_mercado_pago_access_token", lambda: "token-for-tests")

    response = client.post("/payments/mercado-pago/preference", json={"order_id": str(order_id)})

    assert response.status_code == 409
    assert response.json()["detail"] == "order expired before checkout preference creation"

    db_session.expire_all()
    refreshed_order = db_session.get(Order, order_id)
    refreshed_variant = db_session.get(ProductVariant, variant.id)
    assert refreshed_order is not None
    assert refreshed_order.status == "cancelled"
    assert refreshed_order.inventory_released_at is not None
    assert refreshed_variant is not None
    assert refreshed_variant.stock == 4


def test_deleting_product_with_sales_archives_instead_of_crashing(client: TestClient, db_session: Session) -> None:
    product, variant = _seed_product_with_variant(db_session, stock=5, price_cents=2100)
    _seed_sold_order(db_session, variant=variant)

    response = client.delete(f"/products/{product.id}")

    assert response.status_code == 204

    db_session.expire_all()
    persisted_product = db_session.get(Product, product.id)
    assert persisted_product is not None
    assert persisted_product.active is False


def test_updating_sold_variant_by_id_persists_changes(client: TestClient, db_session: Session) -> None:
    product, variant = _seed_product_with_variant(db_session, stock=5, price_cents=3200)
    _seed_sold_order(db_session, variant=variant)

    response = client.put(
        f"/products/{product.id}",
        json={
            "title": "Recovery Updated Product",
            "variants": [
                {
                    "id": str(variant.id),
                    "sku": variant.sku,
                    "price_cents": 4500,
                    "stock": 8,
                    "attributes_json": {"size": "G"},
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["title"] == "Recovery Updated Product"
    assert payload["variants"][0]["price_cents"] == 4500
    assert payload["variants"][0]["stock"] == 8
    assert payload["variants"][0]["attributes_json"] == {"size": "G"}

    db_session.expire_all()
    refreshed_variant = db_session.get(ProductVariant, variant.id)
    assert refreshed_variant is not None
    assert refreshed_variant.price_cents == 4500
    assert refreshed_variant.stock == 8


def test_removing_sold_variant_is_rejected(client: TestClient, db_session: Session) -> None:
    product, variant = _seed_product_with_variant(db_session, stock=5, price_cents=2600)
    _seed_sold_order(db_session, variant=variant)

    response = client.put(
        f"/products/{product.id}",
        json={
            "title": product.title,
            "variants": [],
        },
    )

    assert response.status_code == 409
    assert response.json()["detail"] == f"cannot remove sold variant {variant.id}"
