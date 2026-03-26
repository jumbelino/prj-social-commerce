import type { OrderRead } from "@/lib/api";

type OrderQuickActionOrder = Pick<
  OrderRead,
  | "id"
  | "customer_name"
  | "customer_email"
  | "customer_phone"
  | "delivery_method"
  | "shipping_service_name"
  | "shipping_delivery_days"
  | "shipping_to_postal_code"
  | "latest_payment_external_id"
>;

function normalizeCopyValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized === "" ? null : normalized;
}

export function buildOrderIdCopy(order: Pick<OrderQuickActionOrder, "id">): string {
  return order.id;
}

export function buildCustomerNameCopy(order: Pick<OrderQuickActionOrder, "customer_name">): string | null {
  return normalizeCopyValue(order.customer_name);
}

export function buildCustomerEmailCopy(order: Pick<OrderQuickActionOrder, "customer_email">): string | null {
  return normalizeCopyValue(order.customer_email);
}

export function buildCustomerPhoneCopy(order: Pick<OrderQuickActionOrder, "customer_phone">): string | null {
  return normalizeCopyValue(order.customer_phone);
}

export function buildCustomerContactCopy(order: OrderQuickActionOrder): string | null {
  const parts = [
    buildCustomerNameCopy(order),
    buildCustomerEmailCopy(order),
    buildCustomerPhoneCopy(order),
  ].filter((part): part is string => part !== null);

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" | ");
}

export function buildShippingPostalCodeCopy(order: OrderQuickActionOrder): string | null {
  if (order.delivery_method !== "shipping") {
    return null;
  }
  return normalizeCopyValue(order.shipping_to_postal_code);
}

export function buildShippingSummaryCopy(order: OrderQuickActionOrder): string | null {
  if (order.delivery_method !== "shipping") {
    return null;
  }

  const serviceName = normalizeCopyValue(order.shipping_service_name);
  const postalCode = normalizeCopyValue(order.shipping_to_postal_code);
  const deliveryDays =
    typeof order.shipping_delivery_days === "number" && order.shipping_delivery_days > 0
      ? `${order.shipping_delivery_days} dias`
      : null;

  const parts = [serviceName, deliveryDays, postalCode ? `CEP ${postalCode}` : null].filter(
    (part): part is string => part !== null
  );

  if (parts.length === 0) {
    return null;
  }

  return parts.join(" | ");
}

export function buildExternalPaymentIdCopy(
  order: Pick<OrderQuickActionOrder, "latest_payment_external_id">
): string | null {
  return normalizeCopyValue(order.latest_payment_external_id);
}
