"use client";

import { useState, useEffect, useCallback } from "react";
import { listAdminOrders, updateAdminOrderStatus, type OrderRead } from "@/lib/api";
import { formatCents } from "@/lib/currency";
import { ErrorPanel } from "@/components/error-panel";
import EmptyState from "@/components/admin/EmptyState";

const PAGE_SIZE = 20;
const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"] as const;

export function OrdersClient() {
  const [orders, setOrders] = useState<OrderRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [startDate, setStartDate] = useState<string>("");
  const [endDate, setEndDate] = useState<string>("");
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | undefined>(undefined);
  
  const [selectedOrder, setSelectedOrder] = useState<OrderRead | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  const loadOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const data = await listAdminOrders({ 
        status: statusFilter || undefined, 
        limit: 100,
        offset: 0
      });
      
      let filteredData = data;
      if (startDate || endDate) {
        filteredData = data.filter(order => {
          const orderDate = new Date(order.created_at);
          const start = startDate ? new Date(startDate) : null;
          const end = endDate ? new Date(endDate) : null;
          
          if (start && orderDate < start) return false;
          if (end) {
            const endOfDay = new Date(end);
            endOfDay.setHours(23, 59, 59, 999);
            if (orderDate > endOfDay) return false;
          }
          return true;
        });
      }
      
      const paginatedData = filteredData.slice(offset, offset + PAGE_SIZE);
      setOrders(paginatedData);
      setTotal(filteredData.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, startDate, endDate, page]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    setPage(1);
  }, [statusFilter, startDate, endDate]);

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
      setError(err instanceof Error ? err.message : "Failed to update status");
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

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="">Todos os status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
          
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          />
          
          {(startDate || endDate) && (
            <button
              onClick={() => { setStartDate(""); setEndDate(""); }}
              className="text-sm text-[var(--color-accent)] hover:underline"
            >
              Limpar
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xl text-slate-900">Lista de Pedidos</h2>
            <span className="text-sm text-[var(--color-muted)]">
              {total !== undefined && `${orders.length} de ${total}`}
            </span>
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
                  className={`w-full rounded-lg border p-4 text-left transition hover:border-slate-400 ${
                    selectedOrder?.id === order.id
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                      : "border-[var(--color-line)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{order.customer_email || order.customer_name || "Anônimo"}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {new Date(order.created_at).toLocaleDateString("pt-BR")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium">{formatCents(order.total_cents)}</p>
                      <p className={`text-xs font-medium ${
                        order.status === "confirmed" ? "text-green-600" :
                        order.status === "cancelled" ? "text-red-600" :
                        order.status === "shipped" ? "text-blue-600" :
                        order.status === "delivered" ? "text-emerald-600" :
                        "text-amber-600"
                      }`}>
                        {order.status}
                      </p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>

          {total !== undefined && total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between">
              <button
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1}
                className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="text-sm text-[var(--color-muted)]">
                Página {page} de {Math.ceil(total / PAGE_SIZE)}
              </span>
              <button
                onClick={() => handlePageChange(page + 1)}
                disabled={page * PAGE_SIZE >= total}
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
              <div className="rounded-lg bg-slate-50 p-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">ID do Pedido</p>
                  <p className="font-mono text-sm">{selectedOrder.id}</p>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <p className="text-sm text-[var(--color-muted)]">Origem</p>
                  <p className="text-sm">{selectedOrder.source}</p>
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
                      <p>Variant {item.variant_id.slice(0, 8)}... x{item.quantity}</p>
                      <p>{formatCents(item.total_cents)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 p-4">
                <p className="text-sm font-medium">Frete</p>
                <div className="mt-2 space-y-1 text-sm">
                  <p>{selectedOrder.shipping_service_name || "-"}</p>
                  <p className="text-[var(--color-muted)]">
                    {selectedOrder.shipping_delivery_days} dias - {formatCents(selectedOrder.shipping_cents)}
                  </p>
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
                  {STATUSES.map((s) => (
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
                      {s}
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
