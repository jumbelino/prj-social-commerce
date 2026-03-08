from dataclasses import dataclass
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends, Header, HTTPException, status

from ..core.config import get_settings

from .jwks import JWKSValidator, TokenValidationError


@dataclass(frozen=True)
class Principal:
    subject: str
    roles: tuple[str, ...]
    is_admin: bool
    claims: dict[str, Any]


def _extract_bearer_token(authorization: str | None) -> str:
    if authorization is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or token.strip() == "":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return token.strip()


def _extract_roles(claims: dict[str, Any]) -> tuple[str, ...]:
    realm_access = claims.get("realm_access")
    if not isinstance(realm_access, dict):
        return ()

    roles = realm_access.get("roles")
    if not isinstance(roles, list):
        return ()

    normalized_roles: list[str] = []
    for role in roles:
        if isinstance(role, str) and role:
            normalized_roles.append(role)

    return tuple(normalized_roles)


@lru_cache(maxsize=1)
def get_jwks_validator() -> JWKSValidator:
    settings = get_settings()
    return JWKSValidator(
        jwks_url=settings.oidc_jwks_url,
        issuer=settings.oidc_issuer,
        audience=settings.oidc_audience,
        cache_ttl_seconds=settings.oidc_jwks_cache_ttl_seconds,
        leeway_seconds=settings.oidc_clock_skew_seconds,
    )


def get_current_principal(
    authorization: str | None = Header(default=None),
    validator: JWKSValidator = Depends(get_jwks_validator),
) -> Principal:
    token = _extract_bearer_token(authorization)
    try:
        claims = validator.validate_token(token)
    except TokenValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from exc

    subject = claims.get("sub")
    if not isinstance(subject, str) or subject == "":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid_token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    roles = _extract_roles(claims)
    return Principal(
        subject=subject,
        roles=roles,
        is_admin="admin" in roles,
        claims=claims,
    )


def require_admin(
    principal: Annotated[Principal, Depends(get_current_principal)],
) -> Principal:
    if not principal.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="forbidden",
        )

    return principal
