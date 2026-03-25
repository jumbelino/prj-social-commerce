const DEFAULT_PUBLIC_API_BASE_URL = "http://localhost:8000";

function readPublicApiBaseUrl(): string {
  const configuredBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (!configuredBaseUrl) {
    return DEFAULT_PUBLIC_API_BASE_URL;
  }
  return configuredBaseUrl;
}

export const API_BASE_URL = readPublicApiBaseUrl();

function resolveStorefrontApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return process.env.INTERNAL_API_BASE_URL ?? API_BASE_URL;
  }
  return API_BASE_URL;
}

function resolveNextApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "http://localhost:3000";
  }
  return "";
}

export type ProductVariant = {
  id: string;
  product_id: string;
  sku: string;
  price_cents: number;
  attributes_json: Record<string, unknown>;
  stock: number;
  weight_kg: number | null;
  width_cm: number | null;
  height_cm: number | null;
  length_cm: number | null;
};

export type ProductImage = {
  id: number;
  product_id: string;
  object_key: string;
  url: string;
  position: number;
};

export type Product = {
  id: string;
  title: string;
  description: string | null;
  active: boolean;
  created_at: string;
  variants: ProductVariant[];
  images: ProductImage[];
};

export type ProductVariantCreatePayload = {
  id?: string;
  sku: string;
  price_cents: number;
  attributes_json: Record<string, unknown>;
  stock: number;
  weight_kg?: number | null;
  width_cm?: number | null;
  height_cm?: number | null;
  length_cm?: number | null;
};

export type ProductImageCreatePayload = {
  object_key: string;
  url: string;
  position: number;
};

export type ProductCreatePayload = {
  title: string;
  description?: string | null;
  active?: boolean;
  variants: ProductVariantCreatePayload[];
  images: ProductImageCreatePayload[];
};

export type OrderItemCreate = {
  variant_id: string;
  quantity: number;
};

export type OrderCreatePayload = {
  delivery_method?: "shipping" | "pickup";
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  items: OrderItemCreate[];
  shipping?: {
    provider: "melhor_envio";
    service_id: number;
    service_name: string;
    delivery_days: number;
    price_cents: number;
    from_postal_code?: string;
    to_postal_code: string;
    quote_json?: Record<string, unknown> | null;
  };
};

export type ShippingQuoteRequest = {
  to_postal_code: string;
  items: OrderItemCreate[];
}

export type ShippingOption = {
  service_id: number;
  name: string;
  price_cents: number;
  delivery_days: number;
  raw_json: Record<string, unknown>;
}

export type ShippingQuotesResponse = {
  options: ShippingOption[];
}

export type OrderItemRead = {
  id: number;
  order_id: string;
  variant_id: string;
  quantity: number;
  unit_price_cents: number;
  total_cents: number;
};

export type OrderRead = {
  id: string;
  status: string;
  delivery_method: "shipping" | "pickup";
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  source: string;
  subtotal_cents: number;
  shipping_cents: number;
  shipping_provider: string | null;
  shipping_service_id: number | null;
  shipping_service_name: string | null;
  shipping_delivery_days: number | null;
  shipping_from_postal_code: string | null;
  shipping_to_postal_code: string | null;
  shipping_quote_json: Record<string, unknown> | null;
  total_cents: number;
  expires_at: string | null;
  inventory_released_at: string | null;
  latest_payment_status: string | null;
  latest_payment_external_id: string | null;
  created_at: string;
  items: OrderItemRead[];
};

export type MercadoPagoPixPaymentResponse = {
  payment_id: string;
  status: string;
  qr_code: string | null;
  qr_code_base64: string | null;
  ticket_url: string | null;
  external_reference: string | null;
};

export type MercadoPagoPreferenceResponse = {
  preference_id: string;
  init_point: string;
  sandbox_init_point: string;
  checkout_url: string;
  is_sandbox: boolean;
};

export type MercadoPagoPaymentSyncPayload = {
  order_id: string;
  payment_id?: string;
  payment_status?: string;
};

export class ApiRequestError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
  }
}

type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue };

function extractErrorMessage(payload: unknown): string | null {
  if (typeof payload === "string" && payload.trim() !== "") {
    return payload;
  }

  if (typeof payload === "object" && payload !== null && "detail" in payload) {
    const detail = (payload as { detail?: unknown }).detail
    if (typeof detail === "string" && detail.trim() !== "") {
      return detail
    }
    if (typeof detail === "object" && detail !== null && "message" in detail) {
      const msg = (detail as { message?: unknown }).message
      if (typeof msg === "string" && msg.trim() !== "") {
        return msg
      }
    }
  }

  return null
}

async function requestJsonFromUrl<TResponse>(url: string, init?: RequestInit): Promise<TResponse> {
  const headers = new Headers(init?.headers)

  if (init?.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers,
      cache: "no-store",
      credentials: "include",
    })
  } catch {
    throw new ApiRequestError("Could not reach API server. Check backend availability.", 0)
  }

  let payload: unknown
  const contentType = response.headers.get("content-type") ?? ""
  if (contentType.includes("application/json")) {
    payload = (await response.json()) as JsonObject
  } else {
    payload = await response.text()
  }

  if (!response.ok) {
    throw new ApiRequestError(
      extractErrorMessage(payload) ?? `Request failed with status ${response.status}.`,
      response.status
    )
  }

  return payload as TResponse
}

async function requestJson<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  return requestJsonFromUrl<TResponse>(`${resolveStorefrontApiBaseUrl()}${path}`, init)
}

async function requestNextApi<TResponse>(path: string, init?: RequestInit): Promise<TResponse> {
  return requestJsonFromUrl<TResponse>(`${resolveNextApiBaseUrl()}${path}`, init)
}

export function listProducts(): Promise<Product[]> {
  return requestJson<Product[]>("/products")
}

export function getProductById(productId: string): Promise<Product> {
  return requestJson<Product>(`/products/${productId}`)
}

export function createOrder(payload: OrderCreatePayload): Promise<OrderRead> {
  return requestJson<OrderRead>("/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function getOrderById(orderId: string): Promise<OrderRead> {
  return requestJson<OrderRead>(`/orders/${orderId}`)
}

export function getShippingQuotes(payload: ShippingQuoteRequest): Promise<ShippingQuotesResponse> {
  return requestJson<ShippingQuotesResponse>("/shipping/quotes", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function createMercadoPagoPayment(orderId: string): Promise<MercadoPagoPixPaymentResponse> {
  return requestJson<MercadoPagoPixPaymentResponse>("/payments/mercado-pago", {
    method: "POST",
    body: JSON.stringify({ order_id: orderId }),
  })
}

export function createMercadoPagoPreference(orderId: string, returnUrlBase?: string): Promise<MercadoPagoPreferenceResponse> {
  return requestJson<MercadoPagoPreferenceResponse>("/payments/mercado-pago/preference", {
    method: "POST",
    body: JSON.stringify({
      order_id: orderId,
      ...(returnUrlBase ? { return_url_base: returnUrlBase } : {}),
    }),
  })
}

export function syncMercadoPagoPayment(payload: MercadoPagoPaymentSyncPayload): Promise<OrderRead> {
  return requestJson<OrderRead>("/payments/mercado-pago/sync", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function listAdminProducts(params?: { active?: boolean; query?: string; limit?: number; offset?: number }): Promise<Product[]> {
  const query = new URLSearchParams()
  if (params?.active !== undefined) query.set("active", String(params.active))
  if (params?.query) query.set("query", params.query)
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.offset) query.set("offset", String(params.offset))
  const queryString = query.toString()
  return requestNextApi<Product[]>(`/api/admin/products${queryString ? `?${queryString}` : ""}`)
}

export function deleteAdminProduct(productId: string): Promise<void> {
  return requestNextApi<void>(`/api/admin/products/${productId}`, {
    method: "DELETE",
  })
}

export function toggleAdminProductActive(productId: string, active: boolean): Promise<Product> {
  return requestNextApi<Product>(`/api/admin/products/${productId}`, {
    method: "PUT",
    body: JSON.stringify({ active }),
  })
}

export function createProductAsAdmin(payload: ProductCreatePayload): Promise<Product> {
  return requestNextApi<Product>("/api/admin/products", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function createAdminOrder(payload: OrderCreatePayload): Promise<OrderRead> {
  return requestNextApi<OrderRead>("/api/admin/orders", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export function listAdminOrders(params?: {
  status?: string;
  source?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
}): Promise<OrderRead[]> {
  const query = new URLSearchParams()
  if (params?.status) query.set("status", params.status)
  if (params?.source) query.set("source", params.source)
  if (params?.start_date) query.set("start_date", params.start_date)
  if (params?.end_date) query.set("end_date", params.end_date)
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.offset) query.set("offset", String(params.offset))
  const queryString = query.toString()
  return requestNextApi<OrderRead[]>(`/api/admin/orders${queryString ? `?${queryString}` : ""}`)
}

export function getAdminOrderById(orderId: string): Promise<OrderRead> {
  return requestNextApi<OrderRead>(`/api/admin/orders/${orderId}`)
}

export function getAdminProductById(productId: string): Promise<Product> {
  return requestNextApi<Product>(`/api/admin/products/${productId}`)
}

export function updateAdminOrderStatus(orderId: string, status: string): Promise<OrderRead> {
  return requestNextApi<OrderRead>(`/api/admin/orders/${orderId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  })
}

export type CustomerRead = {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  created_at: string
  total_orders: number
}

export type CustomerCreatePayload = {
  name?: string
  email?: string
  phone?: string
}

export function searchAdminCustomers(params?: { query?: string; limit?: number; offset?: number }): Promise<CustomerRead[]> {
  const query = new URLSearchParams()
  if (params?.query) query.set("query", params.query)
  if (params?.limit) query.set("limit", String(params.limit))
  if (params?.offset) query.set("offset", String(params.offset))
  const queryString = query.toString()
  return requestNextApi<CustomerRead[]>(`/api/admin/customers${queryString ? `?${queryString}` : ""}`)
}

export function createAdminCustomer(payload: CustomerCreatePayload): Promise<CustomerRead> {
  return requestNextApi<CustomerRead>("/api/admin/customers", {
    method: "POST",
    body: JSON.stringify(payload),
  })
}

export type CustomerWithOrders = {
  id: number
  name: string | null
  email: string | null
  phone: string | null
  created_at: string
  orders: OrderRead[]
  total_orders: number
}

export function getAdminCustomerById(customerId: string): Promise<CustomerWithOrders> {
  return requestNextApi<CustomerWithOrders>(`/api/admin/customers/${customerId}`)
}

export type DashboardMetrics = {
  order_count: number
  sales_total_cents: number
  active_products: number
  customer_count: number
}

export function getDashboardMetrics(params?: { start_date?: string; end_date?: string }): Promise<DashboardMetrics> {
  const query = new URLSearchParams()
  if (params?.start_date) query.set("start_date", params.start_date)
  if (params?.end_date) query.set("end_date", params.end_date)
  const queryString = query.toString()
  return requestNextApi<DashboardMetrics>(`/api/admin/dashboard/metrics${queryString ? `?${queryString}` : ""}`)
}
