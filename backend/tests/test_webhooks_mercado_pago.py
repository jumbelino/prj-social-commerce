# pyright: reportMissingImports=false

import hashlib
import hmac
import importlib
from typing import Any, cast

from fastapi.testclient import TestClient
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session


def _get_models() -> tuple[Any, Any]:
    order_module = importlib.import_module("app.models.order")
    payment_module = importlib.import_module("app.models.payment")
    return cast(Any, order_module.Order), cast(Any, payment_module.Payment)


def _sign_mp_webhook(*, secret: str, request_id: str, data_id: str, ts: str) -> str:
    manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
    digest = hmac.new(secret.encode("utf-8"), manifest.encode("utf-8"), hashlib.sha256).hexdigest()
    return f"ts={ts},v1={digest}"


def test_mercado_pago_webhook_rejects_invalid_signature(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MERCADO_PAGO_WEBHOOK_SECRET", "secret-for-tests")

    response = client.post(
        "/webhooks/mercado-pago?data.id=mp-invalid-1",
        headers={
            "x-signature": "ts=1700000000,v1=deadbeef",
            "x-request-id": "req-invalid-1",
        },
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "invalid webhook signature"


def test_mercado_pago_webhook_is_idempotent_on_replay(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    mp_payment_id = "mp-replay-1"
    secret = "secret-for-tests"
    request_id = "req-replay-1"
    ts = "1700000000"

    class FakeMercadoPagoClient:
        def __init__(self, access_token: str):
            self.access_token = access_token

        def get_payment(self, payment_id: str) -> dict[str, object]:
            assert payment_id == mp_payment_id
            return {
                "id": mp_payment_id,
                "status": "approved",
                "external_reference": str(order.id),
            }

    monkeypatch.setenv("MERCADO_PAGO_ACCESS_TOKEN", "token-for-tests")
    monkeypatch.setenv("MERCADO_PAGO_WEBHOOK_SECRET", secret)
    monkeypatch.setattr("app.api.webhooks.MercadoPagoClient", FakeMercadoPagoClient)

    Order, Payment = _get_models()

    order = Order(
        status="pending",
        customer_name="Replay Buyer",
        customer_email="replay@example.com",
        customer_phone=None,
        total_cents=1000,
    )
    db_session.add(order)
    db_session.commit()

    signature = _sign_mp_webhook(secret=secret, request_id=request_id, data_id=mp_payment_id, ts=ts)

    for _ in range(2):
        response = client.post(
            f"/webhooks/mercado-pago?data.id={mp_payment_id}",
            headers={
                "x-signature": signature,
                "x-request-id": request_id,
            },
        )
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}

    db_session.expire_all()
    persisted = db_session.execute(
        select(Payment).where(Payment.provider == "mercado_pago").where(Payment.external_id == mp_payment_id)
    ).scalars().all()
    assert len(persisted) == 1

    persisted_order = db_session.get(Order, order.id)
    assert persisted_order is not None
    assert persisted_order.status == "paid"


def test_mercado_pago_webhook_updates_existing_payment_for_order(client: TestClient, db_session: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    mp_payment_id = "mp-update-1"
    secret = "secret-for-tests"
    request_id = "req-update-1"
    ts = "1700000001"

    class FakeMercadoPagoClient:
        def __init__(self, access_token: str):
            self.access_token = access_token

        def get_payment(self, payment_id: str) -> dict[str, object]:
            assert payment_id == mp_payment_id
            return {
                "id": mp_payment_id,
                "status": "approved",
                "external_reference": str(order.id),
            }

    monkeypatch.setenv("MERCADO_PAGO_ACCESS_TOKEN", "token-for-tests")
    monkeypatch.setenv("MERCADO_PAGO_WEBHOOK_SECRET", secret)
    monkeypatch.setattr("app.api.webhooks.MercadoPagoClient", FakeMercadoPagoClient)

    Order, Payment = _get_models()

    order = Order(
        status="pending",
        customer_name="Update Buyer",
        customer_email="update@example.com",
        customer_phone=None,
        total_cents=1000,
    )
    db_session.add(order)
    db_session.flush()

    existing_payment = Payment(
        order_id=order.id,
        provider="mercado_pago",
        status="pending",
        external_id=None,
        external_reference=str(order.id),
    )
    db_session.add(existing_payment)
    db_session.commit()

    signature = _sign_mp_webhook(secret=secret, request_id=request_id, data_id=mp_payment_id, ts=ts)

    response = client.post(
        f"/webhooks/mercado-pago?data.id={mp_payment_id}",
        headers={
            "x-signature": signature,
            "x-request-id": request_id,
        },
    )

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

    db_session.expire_all()
    persisted = db_session.execute(
        select(Payment).where(Payment.provider == "mercado_pago").where(Payment.order_id == order.id)
    ).scalars().all()
    assert len(persisted) == 1
    assert persisted[0].external_id == mp_payment_id
    assert persisted[0].status == "approved"
