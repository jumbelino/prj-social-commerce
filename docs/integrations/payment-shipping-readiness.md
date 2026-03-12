# Payment and Shipping Integration Readiness

Implementation guide for Mercado Pago payments and Melhor Envio shipping in this repository.

---

## Current Repo State

### Mercado Pago Integration

| File | Purpose |
|------|---------|
| `backend/app/integrations/mercado_pago.py` | Client class, token readers, webhook signature verification, mock toggle |
| `backend/app/api/payments.py` | REST endpoints: PIX payment creation, checkout preferences |
| `backend/app/api/webhooks.py` | Webhook handler at `/webhooks/mercado-pago` with signature validation |
| `backend/app/schemas/payments.py` | Pydantic request/response models |

**Implemented flows:**
- PIX payment creation via `POST /payments/mercado-pago`
- Checkout preference creation via `POST /payments/mercado-pago/preference`
- Webhook reception and payment status updates
- Order status transition from `pending` to `paid` on approved payment

### Melhor Envio Integration

| File | Purpose |
|------|---------|
| `backend/app/integrations/melhor_envio.py` | Client class, token reader, base URL configuration |
| `backend/app/api/shipping.py` | REST endpoint: shipping quote calculation |
| `backend/app/schemas/shipping.py` | Pydantic request/response models |

**Implemented flows:**
- Shipping quote calculation via `POST /shipping/quotes`

### Frontend Integration

| File | Purpose |
|------|---------|
| `frontend/app/cart/page.tsx` | Cart page with CEP input, shipping quote UI, option selection |
| `frontend/tests/cart-shipping.spec.ts` | E2E tests for cart shipping flow |
| `frontend/lib/api.ts` | API client with `getShippingQuotes` function |

---

## Required Credentials and Local Secrets

### Environment Variables (Runtime)

**Mercado Pago:**
| Variable | Required | Description |
|----------|----------|-------------|
| `MERCADO_PAGO_ACCESS_TOKEN` | Yes | Bearer token for API calls |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Yes | HMAC secret for webhook signature verification |
| `MERCADO_PAGO_MOCK` | Optional | Set to `1` to enable mock mode |
| `MERCADO_PAGO_MOCK_GET_STATUS` | Optional | Mock status for `get_payment` calls (default: `approved`) |

**Melhor Envio:**
| Variable | Required | Description |
|----------|----------|-------------|
| `MELHOR_ENVIO_TOKEN` | Yes | Bearer token for API calls |
| `MELHOR_ENVIO_BASE_URL` | Optional | Defaults to `https://sandbox.melhorenvio.com.br` |
| `SHIPPING_ORIGIN_POSTAL_CODE` | Yes | 8-digit origin CEP for quote calculation |

### Local Secrets Storage

Sandbox credentials are stored at:
```
.secrets/sandbox-integrations.env
```

This file is gitignored. Never commit real tokens.

### Environment Templates

Reference files with placeholder values:
- `backend/.env.example`
- `infra/dev/.env.example`

---

## Mercado Pago Runtime Integration

### Token Acquisition

Mercado Pago uses a single access token (not OAuth for server-to-server):

1. Log into [Mercado Pago Developers](https://www.mercadopago.com.br/developers)
2. Navigate to Your Applications > Credentials
3. Copy the **Access Token** (Production or Sandbox)

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/payments` | POST | Create PIX payment |
| `/v1/payments/{id}` | GET | Fetch payment status |
| `/checkout/preferences` | POST | Create checkout preference |

Base URL: `https://api.mercadopago.com`

### Webhook Configuration

1. In Mercado Pago dashboard, configure webhook URL:
   ```
   https://your-domain.com/webhooks/mercado-pago
   ```
2. Enable notifications for `payments` topic
3. Copy the webhook secret and set `MERCADO_PAGO_WEBHOOK_SECRET`

### Signature Verification

The webhook handler verifies signatures using HMAC-SHA256:
- Header: `x-signature` (format: `ts=<timestamp>,v1=<hex>`)
- Header: `x-request-id`
- Query param: `data.id`

See `verify_mercado_pago_webhook_signature()` in `backend/app/integrations/mercado_pago.py`.

### Mock Mode

Set `MERCADO_PAGO_MOCK=1` to bypass real API calls:

```python
# backend/app/integrations/mercado_pago.py:11-12
def _is_mercado_pago_mock_enabled() -> bool:
    return os.getenv("MERCADO_PAGO_MOCK", "0").strip() == "1"
```

Mock behavior:
- `create_pix_payment`: Returns fake QR code and `pending` status
- `create_checkout_preference`: Returns fake preference with mock URLs
- `get_payment`: Returns status from `MERCADO_PAGO_MOCK_GET_STATUS` (default: `approved`)

This allows local development without real Mercado Pago credentials.

---

## Mercado Pago MCP Usage

The MCP (Model Context Protocol) integration is for **development tooling only**, not runtime.

### What MCP Provides

- Documentation lookup and API references
- Webhook payload validation examples
- Payment flow quality checks during development

### What MCP Does NOT Provide

- Runtime API calls (your backend code handles those)
- Production token management
- Real payment processing

### MCP Configuration

See `docs/integrations/mercado-pago-mcp-toggle.md` for configuration details.

Key points:
- MCP endpoint: `https://mcp.mercadopago.com/mcp`
- Requires `MERCADO_PAGO_ACCESS_TOKEN` in MCP client headers
- MCP runs locally in your dev environment

### When to Use MCP

Enable MCP when:
- Looking up Mercado Pago API documentation
- Validating webhook payloads during testing
- Checking implementation correctness

Keep MCP disabled when:
- Working on unrelated features
- Running CI/CD pipelines
- Token rotation is in progress

---

## Melhor Envio Runtime Integration

### Environment Selection

| Environment | Base URL |
|-------------|----------|
| Sandbox | `https://sandbox.melhorenvio.com.br` |
| Production | `https://melhorenvio.com.br` |

Set via `MELHOR_ENVIO_BASE_URL`. Default is sandbox.

### Token Acquisition (OAuth 2.0)

Melhor Envio uses **OAuth 2.0 app authorization**, not simple personal access tokens.

**Official integration path:**

1. Create account at [Melhor Envio](https://melhorenvio.com.br)
2. Register an application in Melhor Envio developer settings
3. Configure OAuth callback URL for your app
4. Complete OAuth authorization flow to obtain:
   - `access_token` (short-lived, used for API calls)
   - `refresh_token` (used to obtain new access tokens)
5. Implement token refresh logic (access tokens expire)

**Current backend expectation:**

The backend consumes a single `MELHOR_ENVIO_TOKEN` env var (see `backend/app/integrations/melhor_envio.py:19-23`). For local development, you can use an already-issued token. For production, implement the full OAuth flow with refresh token rotation.

**Important:** Sandbox and production require separate app registrations with different credentials.

### API Endpoint Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v2/me/shipment/calculate` | POST | Calculate shipping quotes |

### Request Payload Structure

From `backend/app/api/shipping.py:144-148`:

```python
melhor_envio_payload = {
    "from": {"postal_code": origin_postal_code},
    "to": {"postal_code": payload.to_postal_code},
    "products": products_payload,
}
```

Each product requires:
| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Variant UUID |
| `name` | string | SKU |
| `quantity` | int | Quantity |
| `unitary_value` | float | Price in BRL |
| `weight` | float | Weight in kg |
| `width` | int | Width in cm |
| `height` | int | Height in cm |
| `length` | int | Length in cm |

---

## Task 8 Unblock: Shipping Quote Failures

### Root Cause

Shipping quotes fail with HTTP 409 when product variants lack dimension data.

From `backend/app/api/shipping.py:26`:
```python
REQUIRED_DIMENSION_FIELDS = ("weight_kg", "width_cm", "height_cm", "length_cm")
```

The validation at lines 98-119 checks each variant and returns 409 if any dimension is null:

```python
variants_missing_dimensions: list[dict[str, object]] = []
for variant_id in sorted(requested_quantities.keys(), key=str):
    variant = variants_by_id[variant_id]
    missing_fields = [field_name for field_name in REQUIRED_DIMENSION_FIELDS 
                      if getattr(variant, field_name) is None]
    if missing_fields:
        variants_missing_dimensions.append({...})

if variants_missing_dimensions:
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, ...)
```

### Product Variant Model

From `backend/app/models/product.py:48-51`:
```python
weight_kg: Mapped[Decimal | None] = mapped_column(Numeric(10, 3), nullable=True)
width_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
height_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
length_cm: Mapped[int | None] = mapped_column(Integer, nullable=True)
```

All four fields are nullable, so products created without dimensions will block shipping quotes.

### Fix Requirements

To unblock shipping quotes:

1. **Existing products**: Update variants to populate all dimension fields:
   ```sql
   UPDATE product_variants 
   SET weight_kg = 0.5, width_cm = 20, height_cm = 10, length_cm = 15 
   WHERE weight_kg IS NULL OR width_cm IS NULL OR height_cm IS NULL OR length_cm IS NULL;
   ```

2. **Test fixtures**: The test fixture in `frontend/tests/cart-shipping.spec.ts` references:
   ```typescript
   const REAL_PRODUCT = {
     productId: "e7b11ddc-68c9-44b6-95dc-87fced2153e5",
     variantId: "aec958b8-8508-492b-b21b-e1a8afbefbbf",
     ...
   };
   ```
   This variant must have dimensions populated in the database.

3. **Future products**: Consider adding validation at product creation time to require dimensions, or provide sensible defaults.

### Frontend Error Handling

The cart page already handles dimension errors gracefully. From `frontend/app/cart/page.tsx:211-220`:
```typescript
if (error instanceof ApiRequestError && error.status === 409) {
  const backendDetailMessage = await readMissingDimensionsMessage(payload);
  if (backendDetailMessage) {
    nextMessage = backendDetailMessage;
  } else {
    nextMessage = "Shipping quote blocked: one or more variants are missing dimensions...";
  }
}
```

---

## Integration Completion Checklist

### Mercado Pago

- [ ] Obtain sandbox access token from Mercado Pago Developers dashboard
- [ ] Set `MERCADO_PAGO_ACCESS_TOKEN` in environment
- [ ] Configure webhook URL in Mercado Pago dashboard
- [ ] Copy webhook secret and set `MERCADO_PAGO_WEBHOOK_SECRET`
- [ ] Test PIX payment creation via `POST /payments/mercado-pago`
- [ ] Test webhook delivery with signature validation
- [ ] Verify order status transitions to `paid` on approved payment
- [ ] For production: obtain production token and update secrets

### Melhor Envio

- [ ] Create Melhor Envio account
- [ ] Register OAuth application in Melhor Envio developer settings
- [ ] Configure OAuth callback URL for your environment
- [ ] Complete OAuth authorization to obtain access_token and refresh_token
- [ ] Set `MELHOR_ENVIO_TOKEN` in environment (use access_token from OAuth flow)
- [ ] Set `SHIPPING_ORIGIN_POSTAL_CODE` (8 digits)
- [ ] Ensure all shippable product variants have dimensions populated
- [ ] Test shipping quote via `POST /shipping/quotes`
- [ ] For production: register separate production app, switch `MELHOR_ENVIO_BASE_URL`
- [ ] Implement token refresh logic for production (access tokens expire)

### Product Data

- [ ] Audit existing product variants for null dimensions
- [ ] Populate `weight_kg`, `width_cm`, `height_cm`, `length_cm` for all variants
- [ ] Update test fixtures or seed data to include dimension values
- [ ] Consider adding admin UI for dimension entry

### End-to-End Verification

- [ ] Run `frontend/tests/cart-shipping.spec.ts` with real Melhor Envio credentials
- [ ] Verify cart shows shipping options after CEP entry
- [ ] Complete checkout flow with Mercado Pago payment
- [ ] Confirm webhook updates order status

---

## Ordered Execution Plan for Next Session

Copy this section into a new session prompt to resume Task 8 integration work.

### Preflight

1. Read this document first: `docs/integrations/payment-shipping-readiness.md`
2. Check local secrets exist (do NOT copy into git):
   ```bash
   cat .secrets/sandbox-integrations.env | grep -E "MELHOR_ENVIO_TOKEN|MERCADO_PAGO_ACCESS_TOKEN"
   ```
3. Confirm backend envs loaded:
   ```bash
   docker compose -f infra/dev/docker-compose.yml exec backend env | grep -E "MELHOR_ENVIO|MERCADO_PAGO|SHIPPING_ORIGIN"
   ```

### Shipping First (unblock before payments)

4. Identify or create a product variant with valid dimensions:
   ```sql
   SELECT id, sku, weight_kg, width_cm, height_cm, length_cm FROM product_variants;
   ```
   If nulls exist, update:
   ```sql
   UPDATE product_variants SET weight_kg = 0.5, width_cm = 20, height_cm = 10, length_cm = 15 WHERE weight_kg IS NULL;
   ```

5. Fix `frontend/tests/cart-shipping.spec.ts` to require real shipping options:
   - Current test accepts error path (409 response)
   - Change assertion to expect HTTP 200 with non-empty `options` array
   - Reference: `frontend/app/cart/page.tsx` lines 180-230 for quote handling

6. Run shipping E2E:
   ```bash
   cd frontend && npx playwright test cart-shipping.spec.ts
   ```

7. Manual validation on `/cart`:
   - Add product to cart
   - Enter valid CEP (8 digits)
   - Confirm shipping options appear
   - Select an option
   - Proceed to checkout

### Mercado Pago (only after shipping stable)

8. Verify PIX payment creation:
   ```bash
   curl -X POST http://localhost:8000/payments/mercado-pago \
     -H "Content-Type: application/json" \
     -d '{"order_id": "<ORDER_UUID>", "payment_method": "pix"}'
   ```

9. Trigger test webhook:
   ```bash
   curl -X POST 'http://localhost:8000/webhooks/mercado-pago?data.id=<PAYMENT_ID>' \
     -H 'x-signature: ts=1700000000,v1=<VALID_SIG>' \
     -H 'x-request-id: test-req-1'
   ```

10. Confirm order status transitioned to `paid` in database.

### Key Files

| Step | File |
|------|------|
| Dimension validation | `backend/app/api/shipping.py:26, 98-119` |
| Variant model | `backend/app/models/product.py:48-51` |
| Cart shipping UI | `frontend/app/cart/page.tsx:180-230` |
| Shipping E2E | `frontend/tests/cart-shipping.spec.ts` |
| Melhor Envio client | `backend/app/integrations/melhor_envio.py` |
| Mercado Pago client | `backend/app/integrations/mercado_pago.py` |

---

## Related Files Quick Reference

| Category | Files |
|----------|-------|
| Mercado Pago Backend | `backend/app/integrations/mercado_pago.py`, `backend/app/api/payments.py`, `backend/app/api/webhooks.py` |
| Melhor Envio Backend | `backend/app/integrations/melhor_envio.py`, `backend/app/api/shipping.py` |
| Frontend Cart | `frontend/app/cart/page.tsx`, `frontend/lib/api.ts` |
| Tests | `frontend/tests/cart-shipping.spec.ts` |
| Schemas | `backend/app/schemas/payments.py`, `backend/app/schemas/shipping.py` |
| Models | `backend/app/models/product.py`, `backend/app/models/order.py`, `backend/app/models/payment.py` |
| Config Templates | `backend/.env.example`, `infra/dev/.env.example` |
| Secrets | `.secrets/sandbox-integrations.env` (gitignored) |
| MCP Docs | `docs/integrations/mercado-pago-mcp-toggle.md` |
