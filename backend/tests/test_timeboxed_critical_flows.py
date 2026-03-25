# pyright: reportMissingImports=false

from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.payment import Payment
from app.models.product import Product, ProductVariant


def _seed_variant(db_session: Session, *, stock: int, price_cents: int = 1000) -> ProductVariant:
    product = Product(
        title=f"Integration Product {uuid4()}",
        description="test product",
        active=True,
    )
    db_session.add(product)
    db_session.flush()

    variant = ProductVariant(
        product_id=product.id,
        sku=f"sku-{uuid4().hex[:12]}",
        price_cents=price_cents,
        attributes_json={},
        stock=stock,
    )
    db_session.add(variant)
    db_session.commit()
    return variant


def test_products_list_empty(client: TestClient) -> None:
    response = client.get("/products")

    assert response.status_code == 200
    assert response.json() == []


def test_order_create_decrements_stock(client: TestClient, db_session: Session) -> None:
    variant = _seed_variant(db_session, stock=7, price_cents=1350)

    response = client.post(
        "/orders",
        json={
            "customer_name": "Test Buyer",
            "customer_email": "buyer@example.com",
            "customer_phone": "+551199999999",
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 1,
                "service_name": "PAC",
                "delivery_days": 0,
                "price_cents": 0,
                "from_postal_code": "01018020",
                "to_postal_code": "01018020",
                "quote_json": None,
            },
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["status"] == "pending"
    assert payload["source"] == "storefront"
    assert payload["delivery_method"] == "shipping"
    assert payload["subtotal_cents"] == 2700
    assert payload["shipping_cents"] == 0
    assert payload["shipping_provider"] == "melhor_envio"
    assert payload["shipping_service_id"] == 1
    assert payload["shipping_service_name"] == "PAC"
    assert payload["shipping_delivery_days"] == 0
    assert payload["shipping_from_postal_code"] == "01018020"
    assert payload["shipping_to_postal_code"] == "01018020"
    assert payload["total_cents"] == 2700
    assert len(payload["items"]) == 1
    assert payload["items"][0]["quantity"] == 2

    db_session.expire_all()
    refreshed_variant = db_session.get(ProductVariant, variant.id)
    assert refreshed_variant is not None
    assert refreshed_variant.stock == 5


def test_order_create_uses_origin_postal_code_from_env_when_missing_in_payload(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    variant = _seed_variant(db_session, stock=4, price_cents=1500)
    monkeypatch.setenv("SHIPPING_ORIGIN_POSTAL_CODE", "22222222")

    response = client.post(
        "/orders",
        json={
            "customer_name": "Env Buyer",
            "customer_email": "env@example.com",
            "customer_phone": "+5511988887777",
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 17,
                "service_name": "SEDEX",
                "delivery_days": 2,
                "price_cents": 850,
                "to_postal_code": "01310930",
                "quote_json": {"id": 17},
            },
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["delivery_method"] == "shipping"
    assert payload["subtotal_cents"] == 3000
    assert payload["shipping_cents"] == 850
    assert payload["total_cents"] == 3850
    assert payload["shipping_from_postal_code"] == "22222222"
    assert payload["shipping_to_postal_code"] == "01310930"


def test_storefront_order_create_rejects_pickup_delivery_method(
    client: TestClient,
    db_session: Session,
) -> None:
    variant = _seed_variant(db_session, stock=4, price_cents=1500)

    response = client.post(
        "/orders",
        json={
            "delivery_method": "pickup",
            "customer_name": "Pickup Buyer",
            "customer_email": "pickup@example.com",
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
        },
    )

    assert response.status_code == 422
    assert response.json()["detail"] == "storefront orders currently support only shipping delivery_method"


def test_payment_creation_idempotency(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeMercadoPagoClient:
        create_calls = 0
        get_calls = 0

        def __init__(self, access_token: str):
            self.access_token = access_token

        def create_pix_payment(self, order_id: UUID, transaction_amount: float, payer_email: str) -> dict[str, object]:
            type(self).create_calls += 1
            assert transaction_amount == 25.0
            assert payer_email == "buyer@example.com"
            return {
                "id": "mp-test-1",
                "status": "pending",
                "external_reference": str(order_id),
                "point_of_interaction": {
                    "transaction_data": {
                        "qr_code": "000201mock",
                        "qr_code_base64": "ZmFrZS1xcg==",
                        "ticket_url": "https://example.com/ticket/mp-test-1",
                    }
                },
            }

        def get_payment(self, payment_id: str) -> dict[str, object]:
            type(self).get_calls += 1
            assert payment_id == "mp-test-1"
            return {
                "id": payment_id,
                "status": "pending",
                "external_reference": "existing-order",
                "point_of_interaction": {
                    "transaction_data": {
                        "qr_code": "000201mock",
                        "qr_code_base64": "ZmFrZS1xcg==",
                        "ticket_url": "https://example.com/ticket/mp-test-1",
                    }
                },
            }

    monkeypatch.setattr("app.api.payments.read_mercado_pago_access_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.payments.MercadoPagoClient", FakeMercadoPagoClient)

    order = Order(
        status="pending",
        customer_name="Test Buyer",
        customer_email="buyer@example.com",
        customer_phone=None,
        total_cents=2500,
    )
    db_session.add(order)
    db_session.commit()

    first = client.post("/payments/mercado-pago", json={"order_id": str(order.id)})
    second = client.post("/payments/mercado-pago", json={"order_id": str(order.id)})

    assert first.status_code == 200
    assert second.status_code == 200
    assert first.json()["payment_id"] == "mp-test-1"
    assert second.json()["payment_id"] == "mp-test-1"
    assert FakeMercadoPagoClient.create_calls == 1
    assert FakeMercadoPagoClient.get_calls == 1

    payment_count = db_session.execute(
        select(func.count())
        .select_from(Payment)
        .where(Payment.order_id == order.id)
        .where(Payment.provider == "mercado_pago")
    ).scalar_one()
    assert payment_count == 1


def test_payment_creation_recovers_from_unique_collision(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeMercadoPagoClient:
        create_calls = 0

        def __init__(self, access_token: str):
            self.access_token = access_token

        def create_pix_payment(self, order_id: UUID, transaction_amount: float, payer_email: str) -> dict[str, object]:
            type(self).create_calls += 1
            assert transaction_amount == 35.0
            assert payer_email == "race@example.com"
            return {
                "id": "mp-race-new",
                "status": "pending",
                "external_reference": str(order_id),
                "point_of_interaction": {
                    "transaction_data": {
                        "qr_code": "000201race",
                        "qr_code_base64": "cmFjZS1xcg==",
                        "ticket_url": "https://example.com/ticket/mp-race-new",
                    }
                },
            }

    monkeypatch.setattr("app.api.payments.read_mercado_pago_access_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.payments.MercadoPagoClient", FakeMercadoPagoClient)

    order = Order(
        status="pending",
        customer_name="Race Buyer",
        customer_email="race@example.com",
        customer_phone=None,
        total_cents=3500,
    )
    db_session.add(order)
    db_session.commit()

    original_commit = Session.commit
    state = {"triggered": False}

    def collision_once_commit(self: Session) -> None:
        new_payment = next(
            (
                obj
                for obj in self.new
                if isinstance(obj, Payment)
                and obj.order_id == order.id
                and obj.provider == "mercado_pago"
            ),
            None,
        )
        if not state["triggered"] and new_payment is not None:
            state["triggered"] = True
            new_payment.external_id = "mp-race-existing"
            original_commit(self)
            raise IntegrityError("INSERT INTO payments ...", {}, Exception("unique collision"))
        original_commit(self)

    monkeypatch.setattr("app.api.payments.Session.commit", collision_once_commit)

    response = client.post("/payments/mercado-pago", json={"order_id": str(order.id)})

    assert response.status_code == 200
    assert response.json()["payment_id"] == "mp-race-existing"
    assert response.json()["status"] == "pending"
    assert FakeMercadoPagoClient.create_calls == 1

    payment_count = db_session.execute(
        select(func.count())
        .select_from(Payment)
        .where(Payment.order_id == order.id)
        .where(Payment.provider == "mercado_pago")
    ).scalar_one()
    assert payment_count == 1


def test_webhook_invalid_signature_rejected_without_db_change(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    order = Order(
        status="pending",
        customer_name="Webhook Buyer",
        customer_email="webhook@example.com",
        customer_phone=None,
        total_cents=5000,
    )
    db_session.add(order)
    db_session.flush()

    payment = Payment(
        order_id=order.id,
        provider="mercado_pago",
        status="pending",
        external_id="mp-webhook-1",
        external_reference=str(order.id),
    )
    db_session.add(payment)
    db_session.commit()

    before_count = db_session.execute(select(func.count()).select_from(Payment)).scalar_one()

    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_webhook_secret", lambda: "webhook-secret")
    monkeypatch.setattr("app.api.webhooks.verify_mercado_pago_webhook_signature", lambda *args, **kwargs: False)

    response = client.post(
        "/webhooks/mercado-pago?data.id=mp-webhook-1",
        headers={
            "x-signature": "ts=1700000000,v1=invalid",
            "x-request-id": "req-test-1",
        },
    )

    assert response.status_code in {401, 403}

    db_session.expire_all()
    persisted_order = db_session.get(Order, order.id)
    persisted_payment = db_session.get(Payment, payment.id)
    after_count = db_session.execute(select(func.count()).select_from(Payment)).scalar_one()

    assert persisted_order is not None
    assert persisted_order.status == "pending"
    assert persisted_payment is not None
    assert persisted_payment.status == "pending"
    assert after_count == before_count


def test_webhook_accepts_data_id_from_json_body(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeMercadoPagoClient:
        def __init__(self, access_token: str):
            self.access_token = access_token

        def get_payment(self, payment_id: str) -> dict[str, object]:
            assert payment_id == "mp-webhook-body-1"
            return {
                "id": payment_id,
                "status": "approved",
            }

    order = Order(
        status="pending",
        customer_name="Webhook Body Buyer",
        customer_email="webhook-body@example.com",
        customer_phone=None,
        total_cents=4200,
    )
    db_session.add(order)
    db_session.flush()

    payment = Payment(
        order_id=order.id,
        provider="mercado_pago",
        status="pending",
        external_id="mp-webhook-body-1",
        external_reference=str(order.id),
    )
    db_session.add(payment)
    db_session.commit()

    def fake_verify(signature_header: str, request_id: str, data_id: str, secret: str) -> bool:
        assert signature_header == "ts=1700000000,v1=valid"
        assert request_id == "req-test-body-1"
        assert data_id == "mp-webhook-body-1"
        assert secret == "webhook-secret"
        return True

    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_webhook_secret", lambda: "webhook-secret")
    monkeypatch.setattr("app.api.webhooks.verify_mercado_pago_webhook_signature", fake_verify)
    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_access_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.webhooks.MercadoPagoClient", FakeMercadoPagoClient)

    response = client.post(
        "/webhooks/mercado-pago",
        headers={
            "x-signature": "ts=1700000000,v1=valid",
            "x-request-id": "req-test-body-1",
        },
        json={"data": {"id": "mp-webhook-body-1"}},
    )

    assert response.status_code == 200

    db_session.expire_all()
    persisted_order = db_session.get(Order, order.id)
    persisted_payment = db_session.get(Payment, payment.id)

    assert persisted_order is not None
    assert persisted_order.status == "paid"
    assert persisted_payment is not None
    assert persisted_payment.status == "approved"


def test_webhook_replay_keeps_order_paid_without_extra_transition(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class FakeMercadoPagoClient:
        def __init__(self, access_token: str):
            self.access_token = access_token

        def get_payment(self, payment_id: str) -> dict[str, object]:
            assert payment_id == "mp-webhook-2"
            return {
                "id": payment_id,
                "status": "approved",
            }

    order = Order(
        status="pending",
        customer_name="Webhook Buyer",
        customer_email="webhook@example.com",
        customer_phone=None,
        total_cents=5000,
    )
    db_session.add(order)
    db_session.flush()

    payment = Payment(
        order_id=order.id,
        provider="mercado_pago",
        status="pending",
        external_id="mp-webhook-2",
        external_reference=str(order.id),
    )
    db_session.add(payment)
    db_session.commit()

    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_webhook_secret", lambda: "webhook-secret")
    monkeypatch.setattr("app.api.webhooks.verify_mercado_pago_webhook_signature", lambda *args, **kwargs: True)
    monkeypatch.setattr("app.api.webhooks.read_mercado_pago_access_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.webhooks.MercadoPagoClient", FakeMercadoPagoClient)

    first = client.post(
        "/webhooks/mercado-pago?data.id=mp-webhook-2",
        headers={
            "x-signature": "ts=1700000000,v1=valid",
            "x-request-id": "req-test-2",
        },
    )
    second = client.post(
        "/webhooks/mercado-pago?data.id=mp-webhook-2",
        headers={
            "x-signature": "ts=1700000000,v1=valid",
            "x-request-id": "req-test-3",
        },
    )

    assert first.status_code == 200
    assert second.status_code == 200

    db_session.expire_all()
    persisted_order = db_session.get(Order, order.id)
    persisted_payment = db_session.get(Payment, payment.id)

    assert persisted_order is not None
    assert persisted_order.status == "paid"
    assert persisted_payment is not None
    assert persisted_payment.status == "approved"
