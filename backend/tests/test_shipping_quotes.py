# pyright: reportMissingImports=false

from uuid import uuid4

from fastapi.testclient import TestClient
import pytest
from sqlalchemy.orm import Session

from app.models.product import Product, ProductVariant


def _seed_variant(
    db_session: Session,
    *,
    price_cents: int = 1000,
    weight_kg: float | None = None,
    width_cm: int | None = None,
    height_cm: int | None = None,
    length_cm: int | None = None,
) -> ProductVariant:
    product = Product(
        title=f"Shipping Product {uuid4()}",
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
        stock=100,
        weight_kg=weight_kg,
        width_cm=width_cm,
        height_cm=height_cm,
        length_cm=length_cm,
    )
    db_session.add(variant)
    db_session.commit()
    return variant


def test_shipping_quote_returns_409_when_dimensions_are_missing(
    client: TestClient,
    db_session: Session,
) -> None:
    variant = _seed_variant(
        db_session,
        weight_kg=None,
        width_cm=20,
        height_cm=None,
        length_cm=30,
    )

    response = client.post(
        "/shipping/quotes",
        json={
            "to_postal_code": "01310930",
            "items": [{"variant_id": str(variant.id), "quantity": 1}],
        },
    )

    assert response.status_code == 409
    payload = response.json()
    assert payload["detail"]["message"] == "variant dimensions are required to calculate shipping"
    missing_dimensions = payload["detail"]["missing_dimensions"]
    assert len(missing_dimensions) == 1
    assert missing_dimensions[0]["variant_id"] == str(variant.id)
    assert missing_dimensions[0]["sku"] == variant.sku
    assert missing_dimensions[0]["missing_fields"] == ["weight_kg", "height_cm"]


def test_shipping_quote_normalizes_and_sorts_options(
    client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    variant = _seed_variant(
        db_session,
        price_cents=4590,
        weight_kg=0.650,
        width_cm=18,
        height_cm=8,
        length_cm=25,
    )

    captured_payload: dict[str, object] = {}

    class FakeMelhorEnvioClient:
        def __init__(self, token: str, base_url: str):
            assert token == "token-for-tests"
            assert base_url == "https://sandbox.melhorenvio.com.br"

        def calculate_shipment(self, payload: dict[str, object]) -> list[dict[str, object]]:
            captured_payload.update(payload)
            return [
                {
                    "id": 2,
                    "name": "SEDEX",
                    "price": "31.30",
                    "delivery_time": 2,
                    "company": {"name": "Correios"},
                },
                {
                    "id": 1,
                    "name": "PAC",
                    "price": "25.50",
                    "delivery_time": "5",
                    "company": {"name": "Correios"},
                },
            ]

    monkeypatch.setattr("app.api.shipping.read_melhor_envio_token", lambda: "token-for-tests")
    monkeypatch.setattr("app.api.shipping.read_melhor_envio_base_url", lambda: "https://sandbox.melhorenvio.com.br")
    monkeypatch.setattr("app.api.shipping.read_shipping_origin_postal_code", lambda: "01018020")
    monkeypatch.setattr("app.api.shipping.MelhorEnvioClient", FakeMelhorEnvioClient)

    response = client.post(
        "/shipping/quotes",
        json={
            "to_postal_code": "01310930",
            "items": [
                {"variant_id": str(variant.id), "quantity": 1},
                {"variant_id": str(variant.id), "quantity": 2},
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["options"][0]["service_id"] == 1
    assert payload["options"][0]["name"] == "PAC"
    assert payload["options"][0]["price_cents"] == 2550
    assert payload["options"][0]["delivery_days"] == 5
    assert payload["options"][1]["service_id"] == 2
    assert payload["options"][1]["price_cents"] == 3130

    assert captured_payload["from"] == {"postal_code": "01018020"}
    assert captured_payload["to"] == {"postal_code": "01310930"}
    products = captured_payload["products"]
    assert isinstance(products, list)
    assert len(products) == 1
    assert products[0]["id"] == str(variant.id)
    assert products[0]["name"] == variant.sku
    assert products[0]["quantity"] == 3
    assert products[0]["unitary_value"] == 45.9
    assert products[0]["weight"] == 0.65
    assert products[0]["width"] == 18
    assert products[0]["height"] == 8
    assert products[0]["length"] == 25
