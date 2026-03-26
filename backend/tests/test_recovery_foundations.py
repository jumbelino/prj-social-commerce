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
from app.models.payment import Payment
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
    assert payload["delivery_method"] == "shipping"
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


def test_admin_order_creation_supports_pickup_without_shipping(
    client: TestClient,
    db_session: Session,
) -> None:
    _, variant = _seed_product_with_variant(db_session, stock=5, price_cents=2400)

    response = client.post(
        "/admin/orders",
        json={
            "delivery_method": "pickup",
            "customer_name": "Retirada Cliente",
            "customer_email": "retirada@example.com",
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["source"] == "admin_assisted"
    assert payload["delivery_method"] == "pickup"
    assert payload["subtotal_cents"] == 4800
    assert payload["shipping_cents"] == 0
    assert payload["total_cents"] == 4800
    assert payload["shipping_provider"] is None
    assert payload["shipping_service_id"] is None
    assert payload["shipping_service_name"] is None
    assert payload["shipping_delivery_days"] is None
    assert payload["shipping_from_postal_code"] is None
    assert payload["shipping_to_postal_code"] is None
    assert payload["shipping_quote_json"] is None

    db_session.expire_all()
    refreshed_variant = db_session.get(ProductVariant, variant.id)
    assert refreshed_variant is not None
    assert refreshed_variant.stock == 3


def test_admin_orders_can_filter_by_source(
    client: TestClient,
    db_session: Session,
) -> None:
    _, storefront_variant = _seed_product_with_variant(db_session, stock=6, price_cents=1800)
    _, admin_variant = _seed_product_with_variant(db_session, stock=6, price_cents=2200)

    storefront_response = client.post(
        "/orders",
        json={
            "customer_name": "Storefront Buyer",
            "customer_email": "storefront@example.com",
            "items": [{"variant_id": str(storefront_variant.id), "quantity": 1}],
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
    assert storefront_response.status_code == 201

    admin_response = client.post(
        "/admin/orders",
        json={
            "delivery_method": "pickup",
            "customer_name": "Admin Buyer",
            "customer_email": "admin-assisted@example.com",
            "items": [{"variant_id": str(admin_variant.id), "quantity": 1}],
        },
    )
    assert admin_response.status_code == 201

    filtered = client.get("/admin/orders", params={"source": "admin_assisted"})
    assert filtered.status_code == 200
    payload = filtered.json()
    assert len(payload) == 1
    assert payload[0]["source"] == "admin_assisted"
    assert payload[0]["delivery_method"] == "pickup"


def test_admin_orders_can_filter_by_latest_payment_status(
    client: TestClient,
    db_session: Session,
) -> None:
    _, approved_variant = _seed_product_with_variant(db_session, stock=6, price_cents=1800)
    _, pending_variant = _seed_product_with_variant(db_session, stock=6, price_cents=2200)
    _, no_payment_variant = _seed_product_with_variant(db_session, stock=6, price_cents=2600)

    approved_order = _seed_sold_order(db_session, variant=approved_variant, status="paid")
    pending_order = _seed_sold_order(db_session, variant=pending_variant, status="pending")
    no_payment_order = _seed_sold_order(db_session, variant=no_payment_variant, status="pending")

    db_session.add_all(
        [
            Payment(
                order_id=approved_order.id,
                provider="mercado_pago",
                status="pending",
                external_id="mp-approved-old",
                created_at=datetime.now(timezone.utc) - timedelta(minutes=2),
            ),
            Payment(
                order_id=approved_order.id,
                provider="manual",
                status="approved",
                external_id="mp-approved-new",
                created_at=datetime.now(timezone.utc) - timedelta(minutes=1),
            ),
            Payment(
                order_id=pending_order.id,
                provider="mercado_pago",
                status="pending",
                external_id="mp-pending",
                created_at=datetime.now(timezone.utc),
            ),
        ]
    )
    db_session.commit()

    approved_response = client.get("/admin/orders", params={"payment_status": "approved"})
    assert approved_response.status_code == 200
    approved_payload = approved_response.json()
    assert [item["id"] for item in approved_payload] == [str(approved_order.id)]
    assert approved_payload[0]["latest_payment_status"] == "approved"

    combined_response = client.get(
        "/admin/orders",
        params={"payment_status": "approved", "source": "storefront", "status": "paid"},
    )
    assert combined_response.status_code == 200
    combined_payload = combined_response.json()
    assert [item["id"] for item in combined_payload] == [str(approved_order.id)]

    pending_response = client.get("/admin/orders", params={"payment_status": "pending"})
    assert pending_response.status_code == 200
    pending_payload = pending_response.json()
    assert [item["id"] for item in pending_payload] == [str(pending_order.id)]
    assert pending_payload[0]["latest_payment_status"] == "pending"

    none_response = client.get("/admin/orders", params={"payment_status": "none"})
    assert none_response.status_code == 200
    none_payload = none_response.json()
    assert [item["id"] for item in none_payload] == [str(no_payment_order.id)]
    assert none_payload[0]["latest_payment_status"] is None


def test_products_list_supports_query_filter_for_title_and_sku(
    client: TestClient,
    db_session: Session,
) -> None:
    first_product, first_variant = _seed_product_with_variant(db_session, stock=5, price_cents=1200)
    second_product, second_variant = _seed_product_with_variant(db_session, stock=5, price_cents=1300)

    first_product.title = "Camiseta Noturna"
    first_variant.sku = "SKU-NOTURNA-001"
    second_product.title = "Moletom Solar"
    second_variant.sku = "SKU-SOLAR-001"
    db_session.add_all([first_product, first_variant, second_product, second_variant])
    db_session.commit()

    by_title = client.get("/products", params={"query": "Noturna"})
    assert by_title.status_code == 200
    by_title_payload = by_title.json()
    assert [product["id"] for product in by_title_payload] == [str(first_product.id)]

    by_sku = client.get("/products", params={"query": "SOLAR-001"})
    assert by_sku.status_code == 200
    by_sku_payload = by_sku.json()
    assert [product["id"] for product in by_sku_payload] == [str(second_product.id)]


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
