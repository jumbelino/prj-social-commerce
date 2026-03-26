export type AdminBadgeVariant =
  | "neutral"
  | "info"
  | "success"
  | "warning"
  | "danger";

export type AdminBadgeMeta = {
  rawValue: string | null;
  label: string;
  variant: AdminBadgeVariant;
  className: string;
};

const BADGE_CLASSES: Record<AdminBadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-700",
  info: "border-blue-200 bg-blue-50 text-blue-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
  danger: "border-red-200 bg-red-50 text-red-700",
};

function normalizeValue(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

function buildBadgeMeta(
  rawValue: string | null | undefined,
  label: string,
  variant: AdminBadgeVariant
): AdminBadgeMeta {
  return {
    rawValue: normalizeValue(rawValue),
    label,
    variant,
    className: BADGE_CLASSES[variant],
  };
}

export const ORDER_STATUS_VALUES = [
  "pending",
  "paid",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export const PAYMENT_STATUS_FILTER_VALUES = [
  "approved",
  "pending",
  "rejected",
  "cancelled",
  "expired",
  "none",
] as const;

export function getOrderStatusMeta(status: string | null | undefined): AdminBadgeMeta {
  const normalized = normalizeValue(status);

  switch (normalized) {
    case "pending":
      return buildBadgeMeta(status, "Pendente", "warning");
    case "paid":
      return buildBadgeMeta(status, "Pago", "success");
    case "shipped":
      return buildBadgeMeta(status, "Enviado", "info");
    case "delivered":
      return buildBadgeMeta(status, "Entregue", "success");
    case "cancelled":
      return buildBadgeMeta(status, "Cancelado", "danger");
    default:
      return buildBadgeMeta(status, normalized ? "Status desconhecido" : "Sem status", "neutral");
  }
}

export function getPaymentStatusMeta(status: string | null | undefined): AdminBadgeMeta {
  const normalized = normalizeValue(status);

  switch (normalized) {
    case null:
      return buildBadgeMeta(status, "Sem pagamento", "neutral");
    case "approved":
      return buildBadgeMeta(status, "Pago", "success");
    case "pending":
      return buildBadgeMeta(status, "Pendente", "warning");
    case "in_process":
    case "in_mediation":
      return buildBadgeMeta(status, "Em análise", "warning");
    case "rejected":
      return buildBadgeMeta(status, "Falha", "danger");
    case "cancelled":
    case "canceled":
      return buildBadgeMeta(status, "Cancelado", "neutral");
    case "expired":
      return buildBadgeMeta(status, "Expirado", "warning");
    case "refunded":
      return buildBadgeMeta(status, "Reembolsado", "neutral");
    case "charged_back":
      return buildBadgeMeta(status, "Chargeback", "danger");
    default:
      return buildBadgeMeta(status, "Status desconhecido", "neutral");
  }
}

export function getOrderSourceMeta(source: string | null | undefined): AdminBadgeMeta {
  const normalized = normalizeValue(source);

  switch (normalized) {
    case "admin_assisted":
      return buildBadgeMeta(source, "Venda assistida", "info");
    case "storefront":
      return buildBadgeMeta(source, "Loja", "neutral");
    default:
      return buildBadgeMeta(source, "Origem desconhecida", "neutral");
  }
}

export function getDeliveryMethodMeta(deliveryMethod: string | null | undefined): AdminBadgeMeta {
  const normalized = normalizeValue(deliveryMethod);

  switch (normalized) {
    case "pickup":
      return buildBadgeMeta(deliveryMethod, "Retirada", "info");
    case "shipping":
      return buildBadgeMeta(deliveryMethod, "Envio", "neutral");
    default:
      return buildBadgeMeta(deliveryMethod, "Entrega desconhecida", "neutral");
  }
}
