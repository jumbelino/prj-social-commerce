"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import {
  getDeliveryMethodMeta,
  getOrderSourceMeta,
  getOrderStatusMeta,
  getPaymentStatusMeta,
  ORDER_STATUS_VALUES,
} from "@/lib/admin-order-display";
import OperationalBadge from "@/components/admin/OperationalBadge";
import {
  ApiRequestError,
  createMercadoPagoPreference,
  getAdminOrderById,
  updateAdminOrderStatus,
  type MercadoPagoPreferenceResponse,
  type OrderRead,
} from "@/lib/api";
import { formatCents } from "@/lib/currency";
import {
  buildCustomerContactCopy,
  buildCustomerEmailCopy,
  buildCustomerNameCopy,
  buildCustomerPhoneCopy,
  buildExternalPaymentIdCopy,
  buildOrderIdCopy,
  buildShippingPostalCodeCopy,
  buildShippingSummaryCopy,
} from "@/lib/order-quick-actions";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

export default function OrderDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id;

  const [order, setOrder] = useState<OrderRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [paymentLink, setPaymentLink] = useState<MercadoPagoPreferenceResponse | null>(null);
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);
  const [paymentLinkMessage, setPaymentLinkMessage] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadOrder() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getAdminOrderById(orderId);
        if (isActive) {
          setOrder(data);
          setPaymentLink(null);
          setPaymentLinkError(null);
          setPaymentLinkMessage(null);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : "Falha ao carregar pedido";
        if (isActive) {
          setErrorMessage(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    if (orderId) {
      loadOrder();
    }

    return () => {
      isActive = false;
    };
  }, [orderId, retryTrigger]);

  const handleStatusUpdate = async (newStatus: string) => {
    if (!order) return;

    setIsUpdating(true);
    setErrorMessage(null);

    try {
      const updated = await updateAdminOrderStatus(order.id, newStatus);
      setOrder(updated);
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : "Falha ao atualizar status";
      setErrorMessage(message);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCopy = async (value: string | null) => {
    if (!value) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setCopyFeedback({ type: "success", message: "Copiado" });
    } catch {
      setCopyFeedback({ type: "error", message: "Não foi possível copiar" });
    }
  };

  const handleGeneratePaymentLink = async () => {
    if (!order) {
      return;
    }

    setIsGeneratingPaymentLink(true);
    setPaymentLinkError(null);
    setPaymentLinkMessage(null);

    try {
      const preference = await createMercadoPagoPreference(order.id, window.location.origin);
      setPaymentLink(preference);
      setPaymentLinkMessage("Link de pagamento gerado.");
    } catch (error) {
      const message =
        error instanceof ApiRequestError ? error.message : "Não foi possível gerar o link de pagamento";
      setPaymentLinkError(message);
    } finally {
      setIsGeneratingPaymentLink(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)] mx-auto mb-4"></div>
          <p className="text-[var(--color-muted)]">Carregando pedido...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !order) {
    return (
      <div className="space-y-4">
        <ErrorPanel title="Pedido não encontrado" message={errorMessage} />
        <div className="flex gap-3">
          <button
            onClick={() => setRetryTrigger((t) => t + 1)}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] hover:opacity-90"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => router.push("/admin/orders")}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Voltar para lista de pedidos
          </button>
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="space-y-4">
        <ErrorPanel title="Pedido não encontrado" message="O pedido solicitado não existe." />
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Voltar para lista de pedidos
        </button>
      </div>
    );
  }

  const orderStatusMeta = getOrderStatusMeta(order.status);
  const paymentStatusMeta = getPaymentStatusMeta(order.latest_payment_status);
  const sourceMeta = getOrderSourceMeta(order.source);
  const deliveryMeta = getDeliveryMethodMeta(order.delivery_method);
  const hasExpired = order.expires_at ? new Date(order.expires_at).getTime() <= Date.now() : false;
  const hasCustomerEmail = typeof order.customer_email === "string" && order.customer_email.trim() !== "";
  const paymentStatus = order.latest_payment_status;
  const paymentLinkEligibilityReason =
    order.status !== "pending"
      ? "O link só fica disponível para pedidos pendentes."
      : !hasCustomerEmail
        ? "Email do cliente é necessário para gerar o link."
        : hasExpired
          ? "Este pedido expirou e não pode gerar novo link."
          : paymentStatus === "approved"
            ? "Este pedido já possui pagamento aprovado."
            : paymentStatus === "cancelled" || paymentStatus === "canceled"
              ? "Este pagamento foi cancelado."
              : paymentStatus === "expired"
                ? "Este pagamento expirou."
                : null;
  const canGeneratePaymentLink = paymentLinkEligibilityReason === null;
  const canGenerateNewPaymentLink = canGeneratePaymentLink && paymentLink === null;
  const copyActions = {
    orderId: buildOrderIdCopy(order),
    customerName: buildCustomerNameCopy(order),
    customerEmail: buildCustomerEmailCopy(order),
    customerPhone: buildCustomerPhoneCopy(order),
    customerContact: buildCustomerContactCopy(order),
    shippingPostalCode: buildShippingPostalCodeCopy(order),
    shippingSummary: buildShippingSummaryCopy(order),
    externalPaymentId: buildExternalPaymentIdCopy(order),
  };
  const createdAtLabel = new Date(order.created_at).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            Pedido <span className="font-mono">#{order.id.slice(0, 8)}</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Resumo operacional do pedido e acompanhamento de pagamento.
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text-secondary)] transition-colors"
        >
          Voltar para lista
        </button>
      </div>

      {errorMessage && <ErrorPanel title="Erro" message={errorMessage} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-[var(--color-card)] rounded-xl border border-[var(--color-line)] p-6">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
                    Resumo operacional
                  </p>
                  <p className="mt-2 font-mono text-sm text-[var(--color-text)]">{order.id}</p>
                  <p className="mt-1 text-sm text-[var(--color-muted)]">Criado em {createdAtLabel}</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <OperationalBadge meta={paymentStatusMeta} prefix="Pagamento" emphasized />
                  <OperationalBadge meta={orderStatusMeta} prefix="Pedido" />
                  <OperationalBadge meta={sourceMeta} />
                  <OperationalBadge meta={deliveryMeta} />
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-3 lg:min-w-[180px]">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Total do pedido
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--color-text)]">{formatCents(order.total_cents)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {order.delivery_method === "pickup"
                    ? "Retirada sem frete calculado"
                    : `Inclui frete de ${formatCents(order.shipping_cents)}`}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Status do pedido</p>
                <div className="mt-2">
                  <OperationalBadge meta={orderStatusMeta} />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Status do pagamento</p>
                <div className="mt-2">
                  <OperationalBadge meta={paymentStatusMeta} emphasized />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Origem</p>
                <div className="mt-2">
                  <OperationalBadge meta={sourceMeta} />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Método de entrega</p>
                <div className="mt-2">
                  <OperationalBadge meta={deliveryMeta} />
                </div>
              </div>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Cliente</p>
                <p className="mt-2 text-sm font-medium text-[var(--color-text)]">
                  {order.customer_name || order.customer_email || "Cliente não identificado"}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">{order.customer_email || order.customer_phone || "Sem contato informado"}</p>
              </div>
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">Itens</p>
                <p className="mt-2 text-sm font-medium text-[var(--color-text)]">
                  {order.items.length} {order.items.length === 1 ? "item" : "itens"}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Subtotal de {formatCents(order.subtotal_cents)}
                </p>
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Cliente</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Nome</p>
                <p className="text-sm text-[var(--color-text)] mt-1">{order.customer_name || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Email</p>
                <p className="text-sm text-[var(--color-text)] mt-1">{order.customer_email || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Telefone</p>
                <p className="text-sm text-[var(--color-text)] mt-1">{order.customer_phone || "-"}</p>
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Itens do Pedido</h2>
            {order.items && order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-[var(--color-line)] bg-[#fbf8f1] p-4"
                  >
                    <div>
                      <p className="font-medium text-[var(--color-text)]">
                        Variação {item.variant_id.slice(0, 8)}...
                      </p>
                      <p className="text-sm text-[var(--color-muted)]">
                        Quantidade: {item.quantity} x {formatCents(item.unit_price_cents)}
                      </p>
                    </div>
                    <p className="font-semibold text-[var(--color-text)]">{formatCents(item.total_cents)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Nenhum item encontrado.</p>
            )}
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Entrega</h2>
            {order.delivery_method === "pickup" ? (
              <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">Retirada</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      Este pedido foi configurado para retirada e não depende de cotação de frete.
                    </p>
                  </div>
                  <OperationalBadge meta={deliveryMeta} />
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Serviço</p>
                  <p className="text-sm text-[var(--color-text)] mt-1">{order.shipping_service_name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Prazo</p>
                  <p className="text-sm text-[var(--color-text)] mt-1">
                    {order.shipping_delivery_days ? `${order.shipping_delivery_days} dias` : "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">CEP Origem</p>
                  <p className="text-sm text-[var(--color-text)] mt-1">{order.shipping_from_postal_code || "-"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">CEP Destino</p>
                  <p className="text-sm text-[var(--color-text)] mt-1">{order.shipping_to_postal_code || "-"}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Custo do Frete</p>
                  <p className="text-sm text-[var(--color-text)] mt-1">{formatCents(order.shipping_cents)}</p>
                </div>
                {/* Endereço completo de entrega */}
                {(order.shipping_address_street || order.shipping_address_city) ? (
                  <div className="col-span-2 rounded-lg border border-[var(--color-line)] bg-blue-50 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)] mb-2">Endereço de Entrega</p>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {order.shipping_address_street || "-"}
                      {order.shipping_address_number ? `, ${order.shipping_address_number}` : ""}
                      {order.shipping_address_complement ? ` — ${order.shipping_address_complement}` : ""}
                    </p>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {[order.shipping_address_neighborhood, order.shipping_address_city, order.shipping_address_state]
                        .filter(Boolean)
                        .join(", ")}
                    </p>
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      CEP {order.shipping_to_postal_code || "-"}
                    </p>
                  </div>
                ) : (
                  <div className="col-span-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Endereço de Entrega</p>
                    <p className="text-sm text-[var(--color-muted)] mt-1 italic">Não informado (pedido anterior ao campo de endereço)</p>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--color-text)]">Ações rápidas</h2>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Copie os dados úteis do pedido sem selecionar texto manualmente.
                </p>
              </div>
              {copyFeedback ? (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    copyFeedback.type === "success"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-rose-50 text-rose-700"
                  }`}
                >
                  {copyFeedback.message}
                </span>
              ) : null}
            </div>

            <div className="mt-5 space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Pedido
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleCopy(copyActions.orderId)}
                    className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                  >
                    Copiar ID do pedido
                  </button>
                </div>
              </div>

              {(copyActions.customerName ||
                copyActions.customerEmail ||
                copyActions.customerPhone ||
                copyActions.customerContact) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Cliente
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {copyActions.customerName ? (
                      <button
                        onClick={() => handleCopy(copyActions.customerName)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar nome
                      </button>
                    ) : null}
                    {copyActions.customerEmail ? (
                      <button
                        onClick={() => handleCopy(copyActions.customerEmail)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar email
                      </button>
                    ) : null}
                    {copyActions.customerPhone ? (
                      <button
                        onClick={() => handleCopy(copyActions.customerPhone)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar telefone
                      </button>
                    ) : null}
                    {copyActions.customerContact ? (
                      <button
                        onClick={() => handleCopy(copyActions.customerContact)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar contato
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {(copyActions.shippingPostalCode || copyActions.shippingSummary) && (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Entrega
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {copyActions.shippingPostalCode ? (
                      <button
                        onClick={() => handleCopy(copyActions.shippingPostalCode)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar CEP
                      </button>
                    ) : null}
                    {copyActions.shippingSummary ? (
                      <button
                        onClick={() => handleCopy(copyActions.shippingSummary)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar resumo de entrega
                      </button>
                    ) : null}
                  </div>
                </div>
              )}

              {copyActions.externalPaymentId ? (
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                    Pagamento
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => handleCopy(copyActions.externalPaymentId)}
                      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                    >
                      Copiar ID externo
                    </button>
                  </div>
                </div>
              ) : null}

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Cobrança
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    onClick={handleGeneratePaymentLink}
                    disabled={!canGenerateNewPaymentLink || isGeneratingPaymentLink}
                    className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                      canGenerateNewPaymentLink
                        ? "border border-[var(--color-line)] bg-[var(--color-surface-1)] text-[var(--color-text-secondary)] hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                        : "cursor-not-allowed border border-[var(--color-line)] bg-[var(--color-surface-1)] text-[var(--color-muted)]"
                    } disabled:cursor-not-allowed disabled:opacity-70`}
                  >
                    {isGeneratingPaymentLink
                      ? "Gerando link..."
                      : paymentLink
                        ? "Link já gerado"
                        : "Gerar link de pagamento"}
                  </button>

                  {paymentLink?.checkout_url ? (
                    <>
                      <button
                        onClick={() => handleCopy(paymentLink.checkout_url)}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Copiar link
                      </button>
                      <a
                        href={paymentLink.checkout_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition hover:border-[var(--color-line-strong)] hover:text-[var(--color-text)]"
                      >
                        Abrir checkout
                      </a>
                    </>
                  ) : null}
                </div>

                {paymentLinkEligibilityReason ? (
                  <p className="mt-2 text-xs text-[var(--color-muted)]">{paymentLinkEligibilityReason}</p>
                ) : null}
                {paymentLinkMessage ? (
                  <p className="mt-2 text-xs font-medium text-emerald-700">{paymentLinkMessage}</p>
                ) : null}
                {paymentLinkError ? (
                  <p className="mt-2 text-xs font-medium text-rose-700">{paymentLinkError}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Totais</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted)]">Subtotal</span>
                <span className="text-[var(--color-text)]">{formatCents(order.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted)]">Frete</span>
                <span className="text-[var(--color-text)]">{formatCents(order.shipping_cents)}</span>
              </div>
              <div className="border-t border-[var(--color-line)] pt-3 flex justify-between font-semibold">
                <span className="text-[var(--color-text)]">Total</span>
                <span className="text-[var(--color-text)]">{formatCents(order.total_cents)}</span>
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Pagamento</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">Status</span>
                <OperationalBadge meta={paymentStatusMeta} emphasized />
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--color-muted)]">ID externo</span>
                <span className="font-mono text-[var(--color-text)]">{order.latest_payment_external_id || "-"}</span>
              </div>
              {order.latest_payment_status == null && (
                <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3 text-xs text-[var(--color-muted)]">
                  Nenhum pagamento foi iniciado ainda para este pedido.
                </div>
              )}
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-[var(--color-text)] mb-4">Atualizar Status</h2>
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUS_VALUES.map((status) => {
                const isCurrentStatus = order.status === status;
                const isValidTransition = isCurrentStatus || VALID_TRANSITIONS[order.status]?.includes(status) || false;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusUpdate(status)}
                    disabled={isUpdating || !isValidTransition}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition capitalize ${
                      isCurrentStatus
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                        : isValidTransition
                          ? "bg-[var(--color-surface-1)] border border-[var(--color-line)] text-[var(--color-text-secondary)] hover:border-[var(--color-line-strong)]"
                          : "bg-[var(--color-surface-1)] text-[var(--color-muted)] border border-[var(--color-line)] cursor-not-allowed opacity-40"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {getOrderStatusMeta(status).label}
                  </button>
                );
              })}
            </div>
            {isUpdating && (
              <p className="text-xs text-[var(--color-muted)] mt-3">Atualizando...</p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
