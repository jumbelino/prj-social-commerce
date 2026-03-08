import json
import time
from threading import Lock
from typing import Any, cast

import httpx
import jwt
from jwt import InvalidTokenError
from jwt.algorithms import RSAAlgorithm


class TokenValidationError(Exception):
    pass


class JWKSValidator:
    def __init__(
        self,
        jwks_url: str,
        issuer: str | None,
        audience: str | None,
        cache_ttl_seconds: int = 300,
        leeway_seconds: int = 300,
    ) -> None:
        self._jwks_url: str = jwks_url
        self._issuer: str | None = issuer
        self._audience: str | None = audience
        self._cache_ttl_seconds: int = cache_ttl_seconds
        self._leeway_seconds: int = leeway_seconds
        self._keys_by_kid: dict[str, dict[str, Any]] = {}
        self._cache_expires_at: float = 0.0
        self._lock: Lock = Lock()

    def _fetch_jwks(self) -> dict[str, dict[str, Any]]:
        try:
            response = httpx.get(self._jwks_url, timeout=5.0)
            response.raise_for_status()
        except httpx.HTTPError as exc:
            raise TokenValidationError("unable to fetch jwks") from exc

        payload = response.json()
        if not isinstance(payload, dict):
            raise TokenValidationError("invalid jwks payload")

        keys = payload.get("keys")
        if not isinstance(keys, list):
            raise TokenValidationError("invalid jwks payload")

        keys_by_kid: dict[str, dict[str, Any]] = {}
        for key in keys:
            if not isinstance(key, dict):
                continue
            kid = key.get("kid")
            if isinstance(kid, str) and kid:
                keys_by_kid[kid] = key

        if not keys_by_kid:
            raise TokenValidationError("jwks key set is empty")

        return keys_by_kid

    def _ensure_cache(self, force_refresh: bool = False) -> None:
        now = time.monotonic()
        if not force_refresh and self._keys_by_kid and now < self._cache_expires_at:
            return

        with self._lock:
            now = time.monotonic()
            if not force_refresh and self._keys_by_kid and now < self._cache_expires_at:
                return

            self._keys_by_kid = self._fetch_jwks()
            self._cache_expires_at = now + self._cache_ttl_seconds

    def _get_key_for_kid(self, kid: str) -> dict[str, Any]:
        self._ensure_cache(force_refresh=False)
        key = self._keys_by_kid.get(kid)
        if key is not None:
            return key

        self._ensure_cache(force_refresh=True)
        key = self._keys_by_kid.get(kid)
        if key is None:
            raise TokenValidationError("unknown signing key")

        return key

    def validate_token(self, token: str) -> dict[str, Any]:
        try:
            header = jwt.get_unverified_header(token)
        except InvalidTokenError as exc:
            raise TokenValidationError("invalid token header") from exc

        kid = header.get("kid")
        if not isinstance(kid, str) or not kid:
            raise TokenValidationError("token missing kid")

        key_jwk = self._get_key_for_kid(kid)
        try:
            public_key = RSAAlgorithm.from_jwk(json.dumps(key_jwk))
        except (TypeError, ValueError) as exc:
            raise TokenValidationError("invalid jwks key") from exc

        options: dict[str, bool] = {
            "verify_signature": True,
            "verify_exp": True,
            "verify_aud": self._audience is not None,
            "verify_iss": self._issuer is not None,
        }
        decoder = cast(Any, jwt.decode)

        try:
            claims = decoder(
                token,
                public_key,
                algorithms=["RS256"],
                audience=self._audience,
                issuer=self._issuer,
                options=options,
                leeway=self._leeway_seconds,
            )
        except InvalidTokenError as exc:
            raise TokenValidationError("token validation failed") from exc

        if not isinstance(claims, dict):
            raise TokenValidationError("invalid token claims")

        return claims
