# Bug Analysis: admin product edit shows "Produto nao encontrado"

## Scope of this document

- Analysis only, based on source inspection.
- No fix implemented.
- No tests executed for this investigation.

## Reported symptom

When clicking `Editar` in the admin products list, the edit page opens and shows:

- `Produto nao encontrado`
- `Could not reach API server. Check backend availability.`

## Relevant flow

1. The admin products list renders the edit button in `frontend/app/admin/products/client.tsx:140`.
2. Clicking the button calls `handleEdit(p)` in `frontend/app/admin/products/client.tsx:69`.
3. `handleEdit(p)` navigates to `/admin/products/${product.id}` in `frontend/app/admin/products/client.tsx:70`.
4. The edit page reads the route param with `useParams<{ id: string }>()` in `frontend/app/admin/products/[id]/page.tsx:19`.
5. The edit page then loads the product with `getProductById(productId)` in `frontend/app/admin/products/[id]/page.tsx:36`.

## Where the messages come from

### 1) "Produto nao encontrado"

The title is rendered by the edit page itself in `frontend/app/admin/products/[id]/page.tsx:101`:

```tsx
<ErrorPanel title="Produto nao encontrado" message={errorMessage} />
```

There is also a second fallback branch in `frontend/app/admin/products/[id]/page.tsx:123`:

```tsx
<ErrorPanel title="Produto nao encontrado" message="O produto solicitado nao existe." />
```

So the page uses the same title for two different states:

- request failed and `errorMessage` exists
- product is still `null` after loading

### 2) "Could not reach API server. Check backend availability."

This string is thrown by the generic API client in `frontend/lib/api.ts:214`:

```ts
throw new ApiRequestError("Could not reach API server. Check backend availability.", 0)
```

That happens inside `requestJsonFromUrl()` when `fetch(url, ...)` throws before any HTTP response is received.

The edit page catches that error in `frontend/app/admin/products/[id]/page.tsx:40` and stores the message in state at `frontend/app/admin/products/[id]/page.tsx:44`.

Because `product` is still `null`, the page renders the first error branch at `frontend/app/admin/products/[id]/page.tsx:98` and the user sees both strings together.

## Important API split in the codebase

There are two different ways this frontend talks to the backend:

### Public API path

`frontend/lib/api.ts` uses `requestJson()` for direct backend calls:

- `getProductById()` in `frontend/lib/api.ts:247`
- `listAdminProducts()` in `frontend/lib/api.ts:279`
- `deleteAdminProduct()` in `frontend/lib/api.ts:288`
- `toggleAdminProductActive()` in `frontend/lib/api.ts:294`

`getProductById()` specifically calls:

```ts
return requestJson<Product>(`/products/${productId}`)
```

So the edit page currently fetches the product from the direct backend endpoint `/products/{id}`.

### Admin proxy path

There is also a protected Next.js proxy route in `frontend/app/api/admin/products/[id]/route.ts`.

Its `GET` handler:

- checks the session in `frontend/app/api/admin/products/[id]/route.ts:34`
- forwards the bearer token in `frontend/app/api/admin/products/[id]/route.ts:45`
- catches internal fetch failures and returns the same message in `frontend/app/api/admin/products/[id]/route.ts:51`

So the repository already contains an authenticated admin route for reading a single product, but the edit page is not using it for its initial load.

## Backend endpoint involved

The backend single-product read endpoint is `GET /products/{product_id}` in `backend/app/api/products.py:35`.

If the product does not exist, it raises:

```python
raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="product not found")
```

That means a true not-found case would surface as `product not found`, not as `Could not reach API server...`.

## What the source code indicates about this bug

Based on the current code, the observed UI state requires this chain:

1. The edit page route param is populated.
2. The page calls `getProductById(productId)`.
3. That function performs a direct backend request via `requestJson()` instead of the admin proxy route.
4. The request fails before a normal JSON success payload is returned.
5. `requestJsonFromUrl()` converts that failure into `ApiRequestError("Could not reach API server. Check backend availability.", 0)`.
6. The page catches the error and renders the generic `Produto nao encontrado` panel with that network-style message.

## Why the UI is confusing

The edit page mixes two different problem categories under the same title:

- missing product
- request / connectivity failure

So the title says `Produto nao encontrado`, while the message body says the API could not be reached. Those two strings come from different branches of the stack and do not describe the same failure mode.

## Most likely reason in code terms

From source inspection, the strongest conclusion is:

- the admin edit page is loading product data through the direct backend helper `getProductById()` in `frontend/lib/api.ts:247`
- instead of loading through the authenticated admin route in `frontend/app/api/admin/products/[id]/route.ts`

This is the key architectural mismatch visible in the code path.

## Resolution

Fixed by routing the initial product load in the edit page through the admin proxy instead of the direct backend call:

- `frontend/lib/api.ts`: added `getAdminProductById(productId)` using `requestNextApi("/api/admin/products/${productId}")`
- `frontend/app/admin/products/[id]/page.tsx`: replaced `getProductById` import/call with `getAdminProductById` in `loadProduct()` — the PUT via `/api/admin/products/${productId}` in `handleSubmit` was not modified

## Files involved

- `frontend/app/admin/products/client.tsx`
- `frontend/app/admin/products/[id]/page.tsx`
- `frontend/lib/api.ts`
- `frontend/app/api/admin/products/[id]/route.ts`
- `backend/app/api/products.py`
