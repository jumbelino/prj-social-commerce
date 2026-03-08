# pyright: reportMissingImports=false

from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.order import Order, OrderItem
from app.models.payment import Payment
from app.models.product import Product, ProductVariant


def _seed_variant(db_session: Session, *, price_cents: int = 1000) -> ProductVariant:
    product = Product(
        title=f"Checkout Product {uuid4()}",
        description="checkout test product",
        active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"checkout-sku-{uuid4().hex[:12]}",
        price_cents=price_cents,
        attributes_json={},
        stock=10,
    )
    db_session.add(variant)
    db_session.commit()
    return variant


def test_checkout_preference_endpoint_returns_init_points(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeMercadoPagoClient:
        create_calls = 0

        def __init__(self, access_token: str):
            self.access_token = access_token

        def create_checkout_preference(
            self,
            *,
            external_reference: str,
            items: list[dict[str, object]],
        ) -> dict[str, object]:
            type(self).create_calls += 1
            assert external_reference == str(order.id)
            assert len(items) == 2
            assert items[0]["currency_id"] == "BRL"
            assert items[0]["quantity"] == 2
            assert items[0]["unit_price"] == 15.0
            assert items[1]["title"] == "Shipping"
            assert items[1]["quantity"] == 1
            assert items[1]["unit_price"] == 7.0
            return {
                "id": "pref-test-1",
                "init_point": "https://example.com/init/pref-test-1",
                "sandbox_init_point": "https://example.com/sandbox/pref-test-1",
            }

    monkeypatch.setattr("app.api.payments.read_mercado_pago_access_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.payments.MercadoPagoClient", FakeMercadoPagoClient)

    variant = _seed_variant(db_session, price_cents=1500)
    order = Order(
        status="pending",
        customer_name="Checkout Buyer",
        customer_email="checkout@example.com",
        customer_phone=None,
        subtotal_cents=3000,
        shipping_cents=700,
        total_cents=3700,
    )
    db_session.add(order)
    db_session.flush()

    db_session.add(
        OrderItem(
            order_id=order.id,
            variant_id=variant.id,
            quantity=2,
            unit_price_cents=1500,
            total_cents=3000,
        )
    )
    db_session.commit()

    response = client.post("/payments/mercado-pago/preference", json={"order_id": str(order.id)})

    assert response.status_code == 200
    assert response.json() == {
        "preference_id": "pref-test-1",
        "init_point": "https://example.com/init/pref-test-1",
        "sandbox_init_point": "https://example.com/sandbox/pref-test-1",
    }
    assert FakeMercadoPagoClient.create_calls == 1

    persisted_payment = db_session.execute(
        select(Payment).where(Payment.order_id == order.id).where(Payment.provider == "mercado_pago")
    ).scalar_one_or_none()
    assert persisted_payment is None


def test_webhook_creates_payment_from_external_reference_when_missing_external_id(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeMercadoPagoClient:
        def __init__(self, access_token: str):
            self.access_token = access_token

        def get_payment(self, payment_id: str) -> dict[str, object]:
            assert payment_id == "mp-checkout-1"
            return {
                "id": payment_id,
                "status": "approved",
                "external_reference": str(order.id),
            }

    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_webhook_secret", lambda: "webhook-secret")
    monkeypatch.setattr("app.api.webhooks.verify_mercado_pago_webhook_signature", lambda *args, **kwargs: True)
    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_access_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.webhooks.MercadoPagoClient", FakeMercadoPagoClient)

    order = Order(
        status="pending",
        customer_name="Webhook Checkout Buyer",
        customer_email="webhook-checkout@example.com",
        customer_phone=None,
        total_cents=4200,
    )
    db_session.add(order)
    db_session.commit()

    response = client.post(
        "/webhooks/mercado-pago?data.id=mp-checkout-1",
        headers={
            "x-signature": "ts=1700000000,v1=valid",
            "x-request-id": "req-checkout-1",
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    db_session.expire_all()
    persisted_order = db_session.get(Order, order.id)
    persisted_payment = db_session.execute(
        select(Payment)
        .where(Payment.provider == "mercado_pago")
        .where(Payment.external_id == "mp-checkout-1")
    ).scalar_one_or_none()

    assert persisted_order is not None
    assert persisted_order.status == "paid"
    assert persisted_payment is not None
    assert persisted_payment.status == "approved"
    assert persisted_payment.order_id == order.id
    assert persisted_payment.external_reference == str(order.id)
