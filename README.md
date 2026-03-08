# Social Commerce MVP

## Local Development

Requirements:
- Docker CLI installed
- Docker daemon running

One-command entrypoints:
- Start stack: `make dev-up`
- Stop stack: `make dev-down`
- View logs: `make dev-logs`
- Run migrations: `make dev-migrate`

Notes:
- All commands use `infra/dev/docker-compose.yml`.

## Environment Setup

Environment templates are tracked and must stay in sync with code:

- `infra/dev/.env.example`
- `backend/.env.example`
- `frontend/.env.example`

Bootstrapping env files:

```bash
cp infra/dev/.env.example infra/dev/.env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Secrets hygiene:

- Never commit real `MERCADO_PAGO_ACCESS_TOKEN`, `MERCADO_PAGO_WEBHOOK_SECRET`, `NEXTAUTH_SECRET`, or OIDC client secrets.
- Keep placeholder values in `*.env.example` files.

## CORS Policy (Local + Production Note)

- Backend CORS allows only a single configured origin via `FRONTEND_ORIGIN` (default `http://localhost:3000`).
- Local dev should keep `FRONTEND_ORIGIN=http://localhost:3000`.
- For production, set `FRONTEND_ORIGIN` to your real frontend host and do not use wildcard origins.

## Runbook (End-to-End)

### 1) Boot full stack

```bash
docker compose -f infra/dev/docker-compose.yml up -d --build
```

Check health:

```bash
curl -i http://localhost:8000/health
```

Expected: HTTP `200` and JSON body with `{"status":"ok"}`.

### 2) Login to `/admin`

1. Open `http://localhost:3000/admin`.
2. Login with Keycloak user:
   - username: `dev-admin`
   - password: `dev-admin`

### 3) Create a product (API flow)

Get an access token:

```bash
export ADMIN_TOKEN="$(curl -sS -X POST 'http://localhost:8080/realms/social-commerce/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=password' \
  --data-urlencode 'client_id=social-commerce-frontend' \
  --data-urlencode 'username=dev-admin' \
  --data-urlencode 'password=dev-admin' | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"
```

Create product:

```bash
curl -sS -X POST http://localhost:8000/products \
  -H "Authorization: Bearer ${ADMIN_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "title": "Camiseta Social Commerce",
    "description": "Modelo MVP",
    "active": true,
    "variants": [
      {
        "sku": "tee-mvp-001",
        "price_cents": 5900,
        "attributes_json": {"size": "M", "color": "white"},
        "stock": 10
      }
    ],
    "images": [
      {
        "object_key": "products/tee-mvp-001.jpg",
        "url": "https://example.com/tee-mvp-001.jpg",
        "position": 0
      }
    ]
  }'
```

### 4) Place an order

List products and copy one variant id:

```bash
curl -sS http://localhost:8000/products
```

Create order (replace `VARIANT_ID`):

```bash
curl -sS -X POST http://localhost:8000/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "customer_name": "Buyer Dev",
    "customer_email": "buyer@example.com",
    "customer_phone": "+551199999999",
    "items": [
      {"variant_id": "VARIANT_ID", "quantity": 1}
    ]
  }'
```

### 5) Simulate invalid webhook signature

This validates webhook safety checks and should be rejected:

```bash
curl -i -X POST 'http://localhost:8000/webhooks/mercado-pago?data.id=mp-invalid-1' \
  -H 'x-signature: ts=1700000000,v1=invalid' \
  -H 'x-request-id: req-invalid-1'
```

Expected: HTTP `403` with `invalid webhook signature`.

### 6) Inspect orders/payments in DB

```bash
docker exec -it social-commerce-postgres psql -U social_commerce -d social_commerce -c "SELECT id, status, created_at FROM orders ORDER BY created_at DESC LIMIT 10;"
docker exec -it social-commerce-postgres psql -U social_commerce -d social_commerce -c "SELECT id, order_id, provider, external_id, status, created_at FROM payments ORDER BY created_at DESC LIMIT 10;"
```

## Mercado Pago Note

Live Mercado Pago payment creation/webhook confirmation cannot be validated without a real `MERCADO_PAGO_ACCESS_TOKEN` (and matching webhook secret). In local dev with placeholder values, payment endpoints fail fast with explicit missing/invalid credential errors.
