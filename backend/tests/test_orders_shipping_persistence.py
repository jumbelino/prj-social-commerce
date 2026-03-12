# pyright: reportMissingImports=false, reportImplicitRelativeImport=false, reportUnknownVariableType=false, reportUnknownParameterType=false, reportUnknownMemberType=false, reportUnknownArgumentType=false, reportAny=false

from uuid import UUID, uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.models.order import Order
from app.models.product import Product, ProductVariant


def _seed_variant(db_session: Session, *, stock: int = 10, price_cents: int = 1000) -> ProductVariant:
    product = Product(
        title=f"Order Shipping Product {uuid4()}",
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


def test_order_create_persists_shipping_quote_json_and_defaults_origin_postal_code(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    variant = _seed_variant(db_session, stock=4, price_cents=1500)
    monkeypatch.setenv("SHIPPING_ORIGIN_POSTAL_CODE", "22222222")

    quote_snapshot = {
        "service_id": 17,
        "carrier": {"name": "Correios", "id": 1},
        "price": {"cents": 850, "currency": "BRL"},
        "packages": [{"weight_kg": 0.65, "dimensions_cm": [18, 8, 25]}],
        "meta": {"raw": True, "v": 1},
    }

    response = client.post(
        "/orders",
        json={
            "customer_name": "Quote Buyer",
            "customer_email": "quote@example.com",
            "customer_phone": "+5511988887777",
            "items": [{"variant_id": str(variant.id), "quantity": 2}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 17,
                "service_name": "SEDEX",
                "delivery_days": 2,
                "price_cents": 850,
                "from_postal_code": "",
                "to_postal_code": "01310930",
                "quote_json": quote_snapshot,
            },
        },
    )

    assert response.status_code == 201
    payload = response.json()
    assert payload["shipping_from_postal_code"] == "22222222"
    assert payload["shipping_to_postal_code"] == "01310930"
    assert payload["shipping_quote_json"] == quote_snapshot

    order_id = UUID(payload["id"])
    db_session.expire_all()
    persisted_order = db_session.get(Order, order_id)
    assert persisted_order is not None
    assert persisted_order.shipping_from_postal_code == "22222222"
    assert persisted_order.shipping_to_postal_code == "01310930"
    assert persisted_order.shipping_quote_json == quote_snapshot


def test_order_create_rejects_missing_shipping_to_postal_code(
    client: TestClient,
    db_session: Session,
) -> None:
    variant = _seed_variant(db_session, stock=4)

    response = client.post(
        "/orders",
        json={
            "customer_name": "Missing To",
            "customer_email": "missing-to@example.com",
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 1,
                "service_name": "PAC",
                "delivery_days": 5,
                "price_cents": 2550,
                "from_postal_code": "01018020",
                "quote_json": {"id": 1},
            },
        },
    )

    assert response.status_code == 422
    detail = response.json().get("detail")
    assert isinstance(detail, list)
    assert any(item.get("loc") == ["body", "shipping", "to_postal_code"] for item in detail)


def test_order_create_rejects_invalid_shipping_to_postal_code(
    client: TestClient,
    db_session: Session,
) -> None:
    variant = _seed_variant(db_session, stock=4)

    response = client.post(
        "/orders",
        json={
            "customer_name": "Invalid To",
            "customer_email": "invalid-to@example.com",
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
            "shipping": {
                "provider": "melhor_envio",
                "service_id": 1,
                "service_name": "PAC",
                "delivery_days": 5,
                "price_cents": 2550,
                "from_postal_code": "01018020",
                "to_postal_code": "ABC",
                "quote_json": {"id": 1},
            },
        },
    )

    assert response.status_code == 422
    detail = response.json().get("detail")
    assert isinstance(detail, list)
    assert any(item.get("loc") == ["body", "shipping", "to_postal_code"] for item in detail)
