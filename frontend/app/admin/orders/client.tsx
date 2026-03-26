"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listAdminOrders, updateAdminOrderStatus, type OrderRead } from "@/lib/api";
import {
  getDeliveryMethodMeta,
  getOrderSourceMeta,
  getOrderStatusMeta,
  getPaymentStatusMeta,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_FILTER_VALUES,
} from "@/lib/admin-order-display";
import { formatCents } from "@/lib/currency";
import { ErrorPanel } from "@/components/error-panel";
import EmptyState from "@/components/admin/EmptyState";
import OperationalBadge from "@/components/admin/OperationalBadge";

const PAGE_SIZE = 20;

export function OrdersClient() {
  const router = useRouter();
  const [orders, setOrders] = useState<OrderRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  
  const [selectedOrder, setSelectedOrder] = useState<OrderRead | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const data = await listAdminOrders({ 
        status: statusFilter || undefined, 
        payment_status: paymentStatusFilter || undefined,
        source: sourceFilter || undefined,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        limit: PAGE_SIZE + 1,
        offset,
      });

      setHasNextPage(data.length > PAGE_SIZE);
      setOrders(data.slice(0, PAGE_SIZE));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao carregar pedidos");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, paymentStatusFilter, sourceFilter, startDate, endDate, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, paymentStatusFilter, sourceFilter, startDate, endDate]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const updateStatus = async (orderId: string, newStatus: string) => {
    setIsUpdating(true);
    setError(null);
    try {
      const updated = await updateAdminOrderStatus(orderId, newStatus);
      setOrders((prev) => prev.map((o) => (o.id === orderId ? updated : o)));
      if (selectedOrder?.id === orderId) {
        setSelectedOrder(updated);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status");
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)] mx-auto mb-4"></div>
          <p className="text-[var(--color-muted)]">Carregando pedidos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Pedidos</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Gerencie os pedidos dos clientes e atualize o status.
        </p>
      </section>

      {error && <ErrorPanel title="Erro" message={error} />}

      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <div className="flex flex-col gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">
              Filtros operacionais
            </p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Use status do pagamento, status do pedido, origem e período para localizar o contexto certo mais rápido.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--color-muted)]">Status do pedido</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="">Todos os status</option>
                {ORDER_STATUS_VALUES.map((s) => (
                  <option key={s} value={s}>
                    {getOrderStatusMeta(s).label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--color-muted)]">Status do pagamento</span>
              <select
                value={paymentStatusFilter}
                onChange={(e) => setPaymentStatusFilter(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="">Todos os pagamentos</option>
                {PAYMENT_STATUS_FILTER_VALUES.map((status) => (
                  <option key={status} value={status}>
                    {status === "none" ? "Sem pagamento" : getPaymentStatusMeta(status).label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--color-muted)]">Origem</span>
              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              >
                <option value="">Todas as origens</option>
                <option value="storefront">Loja</option>
                <option value="admin_assisted">Venda assistida</option>
              </select>
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--color-muted)]">Data inicial</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>

            <label className="space-y-1">
              <span className="text-xs font-medium text-[var(--color-muted)]">Data final</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
          </div>

          {(statusFilter || paymentStatusFilter || sourceFilter || startDate || endDate) && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium text-[var(--color-muted)]">Filtros ativos:</span>
              {statusFilter ? <OperationalBadge meta={getOrderStatusMeta(statusFilter)} prefix="Pedido" /> : null}
              {paymentStatusFilter ? (
                <OperationalBadge
                  meta={paymentStatusFilter === "none" ? getPaymentStatusMeta(null) : getPaymentStatusMeta(paymentStatusFilter)}
                  prefix="Pagamento"
                  emphasized
                />
              ) : null}
              {sourceFilter ? <OperationalBadge meta={getOrderSourceMeta(sourceFilter)} prefix="Origem" /> : null}
              {(startDate || endDate) ? (
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600">
                  Período {startDate || "início"} até {endDate || "hoje"}
                </span>
              ) : null}
              <button
                onClick={() => {
                  setStatusFilter("");
                  setPaymentStatusFilter("");
                  setSourceFilter("");
                  setStartDate("");
                  setEndDate("");
                }}
                className="text-sm text-[var(--color-accent)] hover:underline"
              >
                Limpar filtros
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-slate-900">Lista de Pedidos</h2>
            <span className="text-sm text-[var(--color-muted)]">{orders.length} na página</span>
          </div>

          <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
            {orders.length === 0 ? (
              <EmptyState
                icon="📋"
                title="Nenhum pedido encontrado"
                description="Os pedidos aparecerão aqui"
              />
            ) : (
              orders.map((order) => (
                <button
                  key={order.id}
                  onClick={() => setSelectedOrder(order)}
                  className={`w-full rounded-xl border p-4 text-left transition hover:border-slate-400 ${
                    selectedOrder?.id === order.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                      : "border-[var(--color-line)]"
                  }`}
                >
                  {(() => {
                    const sourceMeta = getOrderSourceMeta(order.source);
                    const deliveryMeta = getDeliveryMethodMeta(order.delivery_method);
                    const orderStatusMeta = getOrderStatusMeta(order.status);
                    const paymentStatusMeta = getPaymentStatusMeta(order.latest_payment_status);

                    return (
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <p className="text-sm font-semibold text-slate-900">
                          Pedido #{order.id.slice(0, 8)}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          {new Date(order.created_at).toLocaleDateString("pt-BR", {
                            day: "2-digit",
                            month: "2-digit",
                            year: "numeric",
                          })}
                        </p>
                      </div>

                      <div>
                        <p className="truncate text-sm font-medium text-slate-900">
                          {order.customer_name || order.customer_email || "Cliente não identificado"}
                        </p>
                        <p className="truncate text-xs text-[var(--color-muted)]">
                          {order.customer_email || "Sem email"} · {order.items.length} {order.items.length === 1 ? "item" : "itens"}
                        </p>
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <OperationalBadge meta={paymentStatusMeta} prefix="Pagamento" emphasized />
                        <OperationalBadge meta={orderStatusMeta} prefix="Pedido" />
                        <OperationalBadge meta={sourceMeta} />
                        <OperationalBadge meta={deliveryMeta} />
                      </div>
                    </div>

                    <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Total
                      </p>
                      <p className="mt-1 text-base font-semibold text-slate-900">{formatCents(order.total_cents)}</p>
                    </div>
                  </div>
                    );
                  })()}
                </button>
              ))
            )}
          </div>

          {(hasNextPage || page > 1) && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-[var(--color-muted)]">
                Página {page}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={!hasNextPage}
                className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-display text-xl text-slate-900">Detalhes do Pedido</h2>

          {!selectedOrder ? (
            <p className="mt-4 text-sm text-[var(--color-muted)]">Selecione um pedido para ver os detalhes</p>
          ) : (
            <div className="mt-4 space-y-4">
              {(() => {
                const orderStatusMeta = getOrderStatusMeta(selectedOrder.status);
                const paymentStatusMeta = getPaymentStatusMeta(selectedOrder.latest_payment_status);
                const sourceMeta = getOrderSourceMeta(selectedOrder.source);
                const deliveryMeta = getDeliveryMethodMeta(selectedOrder.delivery_method);

                return (
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">ID do Pedido</p>
                  <p className="font-mono text-sm">{selectedOrder.id}</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">Status do pedido</p>
                  <OperationalBadge meta={orderStatusMeta} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">Status do pagamento</p>
                  <OperationalBadge meta={paymentStatusMeta} emphasized />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">Origem</p>
                  <OperationalBadge meta={sourceMeta} />
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">Entrega</p>
                  <OperationalBadge meta={deliveryMeta} />
                </div>
              </div>
                );
              })()}

              <div className="rounded-lg bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm font-medium">Ações</p>
                  <button
                    onClick={() => router.push(`/admin/orders/${selectedOrder.id}`)}
                    className="text-sm font-medium text-[var(--color-accent)] hover:underline"
                  >
                    Abrir detalhe completo
                  </button>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium">Cliente</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
                  <p>{selectedOrder.customer_name || "-"}</p>
                  <p>{selectedOrder.customer_email || "-"}</p>
                  <p>{selectedOrder.customer_phone || "-"}</p>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium">Itens</p>
                <div className="mt-2 space-y-2">
                  {selectedOrder.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between text-sm">
                      <p>Variação {item.variant_id.slice(0, 8)}... x{item.quantity}</p>
                      <p>{formatCents(item.total_cents)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium">Frete</p>
                <div className="mt-2 space-y-1 text-sm">
                  {selectedOrder.delivery_method === "pickup" ? (
                    <p className="text-[var(--color-muted)]">Retirada sem frete calculado</p>
                  ) : (
                    <>
                      <p>{selectedOrder.shipping_service_name || "-"}</p>
                      <p className="text-[var(--color-muted)]">
                        {selectedOrder.shipping_delivery_days} dias - {formatCents(selectedOrder.shipping_cents)}
                      </p>
                    </>
                  )}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium">Pagamento</p>
                <div className="mt-2 space-y-1 text-sm text-[var(--color-muted)]">
                  <p>Status: {getPaymentStatusMeta(selectedOrder.latest_payment_status).label}</p>
                  <p>ID externo: {selectedOrder.latest_payment_external_id || "-"}</p>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <p className="text-sm">Subtotal</p>
                  <p className="text-sm">{formatCents(selectedOrder.subtotal_cents)}</p>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 py-2">
                  <p className="text-sm">Frete</p>
                  <p className="text-sm">{formatCents(selectedOrder.shipping_cents)}</p>
                </div>
                <div className="flex items-center justify-between pt-2 font-semibold">
                  <p>Total</p>
                  <p>{formatCents(selectedOrder.total_cents)}</p>
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium">Atualizar Status</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {ORDER_STATUS_VALUES.map((s) => (
                    <button
                      key={s}
                      onClick={() => updateStatus(selectedOrder.id, s)}
                      disabled={isUpdating || selectedOrder.status === s}
                      className={`rounded px-3 py-1.5 text-xs font-medium transition ${
                        selectedOrder.status === s
                          ? "bg-slate-900 text-white"
                          : "bg-white border border-slate-200 hover:border-slate-400"
                      } disabled:opacity-50`}
                    >
                      {getOrderStatusMeta(s).label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
