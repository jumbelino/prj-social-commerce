import os
from collections.abc import Mapping
from typing import cast

import httpx


class MelhorEnvioError(Exception):
    def __init__(self, status_code: int, response_body: str):
        self.status_code: int = status_code
        self.response_body: str = response_body
        super().__init__(f"Melhor Envio request failed with status {status_code}: {response_body}")


def read_melhor_envio_base_url() -> str:
    return os.getenv("MELHOR_ENVIO_BASE_URL", "https://sandbox.melhorenvio.com.br").rstrip("/")


def read_melhor_envio_token() -> str:
    token = os.getenv("MELHOR_ENVIO_TOKEN")
    if token is None or token.strip() == "":
        raise RuntimeError("Missing required environment variable: MELHOR_ENVIO_TOKEN")
    return token


def read_shipping_origin_postal_code() -> str:
    postal_code = os.getenv("SHIPPING_ORIGIN_POSTAL_CODE")
    if postal_code is None or postal_code.strip() == "":
        raise RuntimeError("Missing required environment variable: SHIPPING_ORIGIN_POSTAL_CODE")
    normalized = postal_code.strip()
    if not normalized.isdigit() or len(normalized) != 8:
        raise RuntimeError("Invalid SHIPPING_ORIGIN_POSTAL_CODE: expected 8 digits")
    return normalized


class MelhorEnvioClient:
    def __init__(self, token: str, base_url: str):
        self._token: str = token
        self._base_url: str = base_url.rstrip("/")

    def calculate_shipment(self, payload: Mapping[str, object]) -> list[Mapping[str, object]]:
        headers = {
            "Authorization": f"Bearer {self._token}",
        }
        response = httpx.post(
            f"{self._base_url}/api/v2/me/shipment/calculate",
            headers=headers,
            json=payload,
            timeout=30.0,
        )
        if response.status_code >= 400:
            raise MelhorEnvioError(response.status_code, response.text)
        response_json: object = response.json()
        if not isinstance(response_json, list):
            raise MelhorEnvioError(response.status_code, f"unexpected response body: {response.text}")
        return cast(list[Mapping[str, object]], response_json)
