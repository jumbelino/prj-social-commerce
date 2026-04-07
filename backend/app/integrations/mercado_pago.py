import os
import hmac
import hashlib
from collections.abc import Mapping
from typing import cast
from uuid import UUID, uuid4

import httpx


def _is_mercado_pago_mock_enabled() -> bool:
    return os.getenv("MERCADO_PAGO_MOCK", "0").strip() == "1"


def read_mercado_pago_checkout_mode() -> str:
    mode = os.getenv("MERCADO_PAGO_CHECKOUT_MODE", "auto").strip().lower()
    if mode in {"sandbox", "production", "auto"}:
        return mode
    return "auto"


def is_mercado_pago_sandbox_enabled(access_token: str | None = None) -> bool:
    if _is_mercado_pago_mock_enabled():
        return True

    checkout_mode = read_mercado_pago_checkout_mode()
    if checkout_mode == "sandbox":
        return True
    if checkout_mode == "production":
        return False

    token = access_token
    if token is None:
        token = os.getenv("MERCADO_PAGO_ACCESS_TOKEN")
    if token is None:
        return False

    return token.strip().startswith("TEST-")


class MercadoPagoError(Exception):
    def __init__(self, status_code: int, response_body: str):
        self.status_code: int = status_code
        self.response_body: str = response_body
        super().__init__(f"Mercado Pago request failed with status {status_code}: {response_body}")


def read_mercado_pago_access_token() -> str:
    if _is_mercado_pago_mock_enabled():
        return "mock-access-token"

    token = os.getenv("MERCADO_PAGO_ACCESS_TOKEN")
    if token is None or token.strip() == "":
        raise RuntimeError("Missing required environment variable: MERCADO_PAGO_ACCESS_TOKEN")
    return token


def read_mercado_pago_webhook_secret() -> str:
    secret = os.getenv("MERCADO_PAGO_WEBHOOK_SECRET")
    if secret is None or secret.strip() == "":
        raise RuntimeError("Missing required environment variable: MERCADO_PAGO_WEBHOOK_SECRET")
    return secret


def parse_mercado_pago_signature_header(signature_header: str) -> tuple[str, str] | None:
    values: dict[str, str] = {}
    for part in signature_header.split(","):
        item = part.strip()
        if item == "" or "=" not in item:
            continue
        key, value = item.split("=", 1)
        values[key.strip().lower()] = value.strip()

    ts = values.get("ts")
    v1 = values.get("v1")
    if ts is None or ts == "" or v1 is None or v1 == "":
        return None
    return ts, v1


def verify_mercado_pago_webhook_signature(
    signature_header: str,
    request_id: str,
    data_id: str,
    secret: str,
) -> bool:
    parsed = parse_mercado_pago_signature_header(signature_header)
    if parsed is None:
        return False

    ts, provided_v1 = parsed
    manifest = f"id:{data_id};request-id:{request_id};ts:{ts};"
    expected_v1 = hmac.new(
        secret.encode("utf-8"),
        manifest.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected_v1, provided_v1.lower())


class MercadoPagoClient:
    def __init__(self, access_token: str, base_url: str = "https://api.mercadopago.com"):
        self._access_token: str = access_token
        self._base_url: str = base_url.rstrip("/")

    def create_pix_payment(
        self,
        order_id: UUID,
        transaction_amount: float,
        payer_email: str,
        payer_cpf: str | None = None,
    ) -> Mapping[str, object]:
        if _is_mercado_pago_mock_enabled():
            payment_id = f"mock-pix-{uuid4()}"
            return {
                "id": payment_id,
                "status": "pending",
                "external_reference": str(order_id),
                "transaction_amount": transaction_amount,
                "payment_method_id": "pix",
                "payer": {"email": payer_email},
                "point_of_interaction": {
                    "transaction_data": {
                        "qr_code": f"000201010212...mock:{payment_id}",
                        "qr_code_base64": "bW9jay1waXgtcXItY29kZQ==",
                        "ticket_url": f"https://mock.mercadopago.local/pix/{payment_id}",
                    }
                },
            }

        payer: dict[str, object] = {"email": payer_email}
        if payer_cpf:
            cpf_digits = "".join(c for c in payer_cpf if c.isdigit())
            if cpf_digits:
                payer["identification"] = {"type": "CPF", "number": cpf_digits}

        payload = {
            "transaction_amount": transaction_amount,
            "payment_method_id": "pix",
            "external_reference": str(order_id),
            "payer": payer,
        }
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "X-Idempotency-Key": str(uuid4()),
        }
        response = httpx.post(
            f"{self._base_url}/v1/payments",
            headers=headers,
            json=payload,
            timeout=30.0,
        )
        if response.status_code >= 400:
            raise MercadoPagoError(response.status_code, response.text)
        return cast(Mapping[str, object], response.json())

    def create_checkout_preference(
        self,
        *,
        external_reference: str,
        items: list[dict[str, object]],
        payer_email: str | None = None,
        back_urls: Mapping[str, str] | None = None,
        notification_url: str | None = None,
    ) -> Mapping[str, object]:
        if _is_mercado_pago_mock_enabled():
            deterministic_suffix = external_reference.replace("-", "")[:12] or "default"
            preference_id = f"mock-pref-{deterministic_suffix}"
            return {
                "id": preference_id,
                "init_point": f"https://mock.mercadopago.local/checkout/{preference_id}",
                "sandbox_init_point": f"https://sandbox.mock.mercadopago.local/checkout/{preference_id}",
                "external_reference": external_reference,
                "items": items,
            }

        normalized_items: list[dict[str, object]] = []
        for item in items:
            raw_title = item.get("title", "Item")
            raw_quantity = item.get("quantity", 1)
            raw_unit_price = item.get("unit_price", 0.0)

            if isinstance(raw_quantity, (int, float, str)):
                quantity = int(cast(int | float | str, raw_quantity))
            else:
                quantity = 1

            if isinstance(raw_unit_price, (int, float, str)):
                unit_price = float(cast(int | float | str, raw_unit_price))
            else:
                unit_price = 0.0

            normalized_items.append(
                {
                    "title": str(raw_title),
                    "currency_id": "BRL",
                    "quantity": quantity,
                    "unit_price": unit_price,
                }
            )

        payload = {
            "external_reference": external_reference,
            "items": normalized_items,
        }
        if payer_email is not None and payer_email.strip() != "":
            payload["payer"] = {"email": payer_email.strip()}
        if back_urls:
            payload["back_urls"] = dict(back_urls)
            success_url = back_urls.get("success", "")
            if success_url and "localhost" not in success_url and "127.0.0.1" not in success_url:
                payload["auto_return"] = "approved"
        if notification_url is not None and notification_url.strip() != "":
            payload["notification_url"] = notification_url.strip()
        headers = {
            "Authorization": f"Bearer {self._access_token}",
            "X-Idempotency-Key": str(uuid4()),
        }
        response = httpx.post(
            f"{self._base_url}/checkout/preferences",
            headers=headers,
            json=payload,
            timeout=30.0,
        )
        if response.status_code >= 400:
            raise MercadoPagoError(response.status_code, response.text)
        return cast(Mapping[str, object], response.json())

    def get_payment(self, payment_id: str) -> Mapping[str, object]:
        if _is_mercado_pago_mock_enabled():
            mock_status = os.getenv("MERCADO_PAGO_MOCK_GET_STATUS", "approved").strip() or "approved"
            return {
                "id": payment_id,
                "status": mock_status,
                "point_of_interaction": {
                    "transaction_data": {
                        "qr_code": f"000201010212...mock:{payment_id}",
                        "qr_code_base64": "bW9jay1waXgtcXItY29kZQ==",
                        "ticket_url": f"https://mock.mercadopago.local/pix/{payment_id}",
                    }
                },
            }

        headers = {
            "Authorization": f"Bearer {self._access_token}",
        }
        response = httpx.get(
            f"{self._base_url}/v1/payments/{payment_id}",
            headers=headers,
            timeout=30.0,
        )
        if response.status_code >= 400:
            raise MercadoPagoError(response.status_code, response.text)
        return cast(Mapping[str, object], response.json())
