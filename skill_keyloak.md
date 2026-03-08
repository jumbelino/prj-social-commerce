---
name: keycloak-oidc-auth
description: Implement, migrate, or troubleshoot end-to-end authentication with Keycloak via OIDC for frontend and backend applications. Use this skill when configuring login/logout redirects, OIDC environment variables, frontend OIDC clients, backend JWT validation using JWKS, token claim mapping (role, allowed_pools, tenant_id), or diagnosing 401/403 and callback issues.
---

# Keycloak Oidc Auth

Implement Keycloak OIDC with a deterministic path: validate issuer metadata, configure frontend redirect flow, validate JWT in backend via JWKS, and map authorization claims explicitly.

Use reference templates from [references/env-and-claims.md](references/env-and-claims.md) when creating new projects.

## Workflow

1. Confirm identity provider metadata.
- Open `{authority}/.well-known/openid-configuration`.
- Verify `authorization_endpoint`, `token_endpoint`, `userinfo_endpoint`, `end_session_endpoint`, and `jwks_uri`.
- Confirm the issuer URL matches backend `OIDC_ISSUER` when issuer validation is enabled.

2. Configure frontend OIDC client.
- Set `authority`, `client_id`, `redirect_uri`, `post_logout_redirect_uri`, `response_type=code`, and `scope`.
- Redirect unauthenticated users to login while preserving target route (`next` state/query).
- Store user/session in session storage for browser-tab isolation when needed.

3. Configure backend token validation.
- Read bearer token, parse `kid`, fetch public key from `jwks_uri`, validate signature and `exp`.
- Validate `aud` and `iss` when configured for production.
- Return `401` for missing/invalid/expired token.

4. Map claims to authorization context.
- Extract stable identity (`sub`, fallback username fields).
- Normalize role from `role`, `roles[]`, or `realm_access.roles[]`.
- Normalize `allowed_pools`: string, list, or wildcard `*`.
- Provide a deterministic fallback for optional tenant claim (for example, `tenant_id=default`).

5. Validate flow end-to-end.
- Frontend should redirect to Keycloak and return to callback route.
- Callback should restore intended route and authenticated state.
- API requests with valid token should pass, invalid token should fail with `401`.

## Project Pattern (This Repo)

- Frontend OIDC config pattern: `frontend/src/auth/oidc.ts`.
- Auth gate pattern: `frontend/src/auth/RequireAuth.tsx`.
- Backend JWT+JWKS pattern: `backend/app/auth/dependencies.py` and `backend/app/auth/jwks.py`.
- Local dev provider + realm import: `infra/dev/docker-compose.yml` and `infra/dev/keycloak/realm-proxmox.json`.
- Shared env baseline: `infra/dev/.env.example`.

## Troubleshooting

1. Login loop to `/login`.
- Cause: wrong `redirect_uri`, callback route mismatch, or state not preserved.
- Check frontend env values and callback route registration in Keycloak client.

2. Immediate auth error on startup.
- Cause: missing `VITE_OIDC_AUTHORITY` or `VITE_OIDC_CLIENT_ID`.
- Check frontend env loading and container/runtime injection.

3. Backend returns `401 invalid_token`.
- Cause: wrong `OIDC_JWKS_URL`, stale key cache after key rotation, issuer/audience mismatch.
- Check `jwks_uri` from well-known metadata and backend envs (`OIDC_JWKS_URL`, `OIDC_ISSUER`, `OIDC_AUDIENCE`).

4. Backend returns `403` even with valid token.
- Cause: claims not normalized as expected (role/allowed_pools).
- Inspect decoded claims and claim mapping logic.

## Reuse in Other Projects

1. Copy this skill folder to another repo or install it into shared Codex skills.
2. Update env template values (authority, client ID, issuer, audience, JWKS URL).
3. Keep the same validation order: metadata -> frontend redirect -> backend JWT -> claims mapping.
