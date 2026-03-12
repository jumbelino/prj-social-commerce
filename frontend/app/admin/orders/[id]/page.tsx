"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { ApiRequestError, getAdminOrderById, updateAdminOrderStatus, type OrderRead } from "@/lib/api";
import { formatCents } from "@/lib/currency";

const STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"] as const;

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
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : "Failed to load order";
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
        error instanceof ApiRequestError ? error.message : "Failed to update status";
      setErrorMessage(message);
    } finally {
      setIsUpdating(false);
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
        <ErrorPanel title="Pedido nao encontrado" message={errorMessage} />
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
        <ErrorPanel title="Pedido nao encontrado" message="O pedido solicitado nao existe." />
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Voltar para lista de pedidos
        </button>
      </div>
    );
  }

  const statusColor = {
    pending: "text-amber-600 bg-amber-50 border-amber-200",
    paid: "text-green-600 bg-green-50 border-green-200",
    shipped: "text-blue-600 bg-blue-50 border-blue-200",
    delivered: "text-emerald-600 bg-emerald-50 border-emerald-200",
    cancelled: "text-red-600 bg-red-50 border-red-200",
  }[order.status] || "text-slate-600 bg-slate-50 border-slate-200";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Pedido <span className="font-mono">#{order.id.slice(0, 8)}</span>
          </h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Detalhes do pedido
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/orders")}
          className="text-sm text-[var(--color-muted)] hover:text-slate-700 transition-colors"
        >
          Voltar para lista
        </button>
      </div>

      {errorMessage && <ErrorPanel title="Erro" message={errorMessage} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Informacoes do Pedido</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">ID</p>
                <p className="font-mono text-sm text-slate-900 mt-1">{order.id}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Status</p>
                <span className={`inline-block mt-1 px-2 py-1 rounded text-xs font-medium capitalize border ${statusColor}`}>
                  {order.status}
                </span>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Data</p>
                <p className="text-sm text-slate-900 mt-1">
                  {new Date(order.created_at).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Origem</p>
                <p className="text-sm text-slate-900 mt-1 capitalize">{order.source}</p>
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Cliente</h2>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Nome</p>
                <p className="text-sm text-slate-900 mt-1">{order.customer_name || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Email</p>
                <p className="text-sm text-slate-900 mt-1">{order.customer_email || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Telefone</p>
                <p className="text-sm text-slate-900 mt-1">{order.customer_phone || "-"}</p>
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Itens do Pedido</h2>
            {order.items && order.items.length > 0 ? (
              <div className="space-y-3">
                {order.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-4 rounded-lg border border-[var(--color-line)] bg-[#fbf8f1]"
                  >
                    <div>
                      <p className="font-medium text-slate-900">
                        Variant {item.variant_id.slice(0, 8)}...
                      </p>
                      <p className="text-sm text-[var(--color-muted)]">
                        Quantidade: {item.quantity} x {formatCents(item.unit_price_cents)}
                      </p>
                    </div>
                    <p className="font-semibold text-slate-900">{formatCents(item.total_cents)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--color-muted)]">Nenhum item encontrado.</p>
            )}
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Entrega</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Servico</p>
                <p className="text-sm text-slate-900 mt-1">{order.shipping_service_name || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Prazo</p>
                <p className="text-sm text-slate-900 mt-1">
                  {order.shipping_delivery_days ? `${order.shipping_delivery_days} dias` : "-"}
                </p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">CEP Origem</p>
                <p className="text-sm text-slate-900 mt-1">{order.shipping_from_postal_code || "-"}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">CEP Destino</p>
                <p className="text-sm text-slate-900 mt-1">{order.shipping_to_postal_code || "-"}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Custo do Frete</p>
                <p className="text-sm text-slate-900 mt-1">{formatCents(order.shipping_cents)}</p>
              </div>
            </div>
          </section>
        </div>

        <div className="space-y-6">
          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Resumo</h2>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted)]">Subtotal</span>
                <span className="text-slate-900">{formatCents(order.subtotal_cents)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-muted)]">Frete</span>
                <span className="text-slate-900">{formatCents(order.shipping_cents)}</span>
              </div>
              <div className="border-t border-[var(--color-line)] pt-3 flex justify-between font-semibold">
                <span className="text-slate-900">Total</span>
                <span className="text-slate-900">{formatCents(order.total_cents)}</span>
              </div>
            </div>
          </section>

          <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
            <h2 className="text-lg font-semibold text-slate-900 mb-4">Atualizar Status</h2>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map((status) => {
                const isCurrentStatus = order.status === status;
                const isValidTransition = isCurrentStatus || VALID_TRANSITIONS[order.status]?.includes(status) || false;
                return (
                  <button
                    key={status}
                    onClick={() => handleStatusUpdate(status)}
                    disabled={isUpdating || !isValidTransition}
                    className={`px-3 py-2 text-xs font-medium rounded-lg transition capitalize ${
                      isCurrentStatus
                        ? "bg-slate-900 text-white"
                        : isValidTransition
                          ? "bg-white border border-[var(--color-line)] text-slate-700 hover:border-slate-400"
                          : "bg-gray-50 text-gray-300 border border-gray-100 cursor-not-allowed"
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {status}
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
