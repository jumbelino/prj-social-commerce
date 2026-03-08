# pyright: reportMissingImports=false

from collections import defaultdict
from collections.abc import Mapping
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db.session import get_db_session
from ..integrations.melhor_envio import (
    MelhorEnvioClient,
    MelhorEnvioError,
    read_melhor_envio_base_url,
    read_melhor_envio_token,
    read_shipping_origin_postal_code,
)
from ..models.product import ProductVariant
from ..schemas.shipping import ShippingQuoteCreate, ShippingQuoteOptionRead, ShippingQuoteResponse

shipping_router = APIRouter(prefix="/shipping", tags=["shipping"])

REQUIRED_DIMENSION_FIELDS = ("weight_kg", "width_cm", "height_cm", "length_cm")


def _to_price_cents(value: object) -> int | None:
    try:
        normalized = Decimal(str(value))
    except (InvalidOperation, ValueError):
        return None
    cents = (normalized * 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(cents)


def _to_delivery_days(value: object) -> int | None:
    try:
        return int(str(value))
    except ValueError:
        return None


def _normalize_option(option: Mapping[str, object]) -> ShippingQuoteOptionRead | None:
    service_id_value = option.get("id")
    name_value = option.get("name")
    price_value = option.get("price")
    delivery_time_value = option.get("delivery_time")

    try:
        service_id = int(str(service_id_value))
    except ValueError:
        return None
    if name_value is None:
        return None

    price_cents = _to_price_cents(price_value)
    delivery_days = _to_delivery_days(delivery_time_value)
    if price_cents is None or delivery_days is None:
        return None

    return ShippingQuoteOptionRead(
        service_id=service_id,
        name=str(name_value),
        price_cents=price_cents,
        delivery_days=delivery_days,
        raw_json=dict(option),
    )


@shipping_router.post("/quotes", response_model=ShippingQuoteResponse)
def calculate_quotes(
    payload: ShippingQuoteCreate,
    db: Annotated[Session, Depends(get_db_session)],
) -> ShippingQuoteResponse:
    requested_quantities: dict[UUID, int] = defaultdict(int)
    for item in payload.items:
        requested_quantities[item.variant_id] += item.quantity

    stmt = select(ProductVariant).where(ProductVariant.id.in_(list(requested_quantities.keys()))).order_by(ProductVariant.id)
    variants = db.execute(stmt).scalars().all()
    variants_by_id = {variant.id: variant for variant in variants}

    missing_variant_ids = sorted(
        (variant_id for variant_id in requested_quantities if variant_id not in variants_by_id),
        key=str,
    )
    if missing_variant_ids:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={
                "message": "variant not found",
                "missing_variant_ids": [str(variant_id) for variant_id in missing_variant_ids],
            },
        )

    variants_missing_dimensions: list[dict[str, object]] = []
    for variant_id in sorted(requested_quantities.keys(), key=str):
        variant = variants_by_id[variant_id]
        missing_fields = [field_name for field_name in REQUIRED_DIMENSION_FIELDS if getattr(variant, field_name) is None]
        if missing_fields:
            variants_missing_dimensions.append(
                {
                    "variant_id": str(variant.id),
                    "sku": variant.sku,
                    "missing_fields": missing_fields,
                }
            )

    if variants_missing_dimensions:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "message": "variant dimensions are required to calculate shipping",
                "missing_dimensions": variants_missing_dimensions,
                "required_fields": list(REQUIRED_DIMENSION_FIELDS),
            },
        )

    try:
        token = read_melhor_envio_token()
        base_url = read_melhor_envio_base_url()
        origin_postal_code = read_shipping_origin_postal_code()
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(exc)) from exc

    products_payload: list[dict[str, object]] = []
    for variant_id in sorted(requested_quantities.keys(), key=str):
        variant = variants_by_id[variant_id]
        products_payload.append(
            {
                "id": str(variant.id),
                "name": variant.sku,
                "quantity": requested_quantities[variant_id],
                "unitary_value": variant.price_cents / 100,
                "weight": float(variant.weight_kg),
                "width": int(variant.width_cm),
                "height": int(variant.height_cm),
                "length": int(variant.length_cm),
            }
        )

    melhor_envio_payload = {
        "from": {"postal_code": origin_postal_code},
        "to": {"postal_code": payload.to_postal_code},
        "products": products_payload,
    }

    client = MelhorEnvioClient(token=token, base_url=base_url)
    try:
        quote_data = client.calculate_shipment(melhor_envio_payload)
    except MelhorEnvioError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Melhor Envio error ({exc.status_code}): {exc.response_body}",
        ) from exc

    normalized_options = [normalized for normalized in (_normalize_option(option) for option in quote_data) if normalized]
    normalized_options.sort(key=lambda option: option.price_cents)
    return ShippingQuoteResponse(options=normalized_options)
