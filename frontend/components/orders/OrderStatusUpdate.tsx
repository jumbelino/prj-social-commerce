"use client";

import { useState } from "react";
import { getOrderStatusMeta, ORDER_STATUS_VALUES } from "@/lib/admin-order-display";
import { updateAdminOrderStatus } from "@/lib/api";

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

interface OrderStatusUpdateProps {
  orderId: string;
  currentStatus: string;
  onUpdated?: (newStatus: string) => void;
}

export function OrderStatusUpdate({
  orderId,
  currentStatus,
  onUpdated,
}: OrderStatusUpdateProps) {
  const [status, setStatus] = useState(currentStatus);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validOptions = VALID_TRANSITIONS[currentStatus] || [];
  const statusMeta = getOrderStatusMeta(status);

  const handleUpdate = async (newStatus: string) => {
    if (newStatus === currentStatus) return;

    setIsLoading(true);
    setError(null);

    try {
      const updated = await updateAdminOrderStatus(orderId, newStatus);
      setStatus(updated.status);
      onUpdated?.(updated.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao atualizar status");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          className={`rounded border px-2 py-1 text-sm font-medium ${statusMeta.className}`}
        >
          {statusMeta.label}
        </span>

        <select
          value={status}
          onChange={(e) => handleUpdate(e.target.value)}
          disabled={isLoading || validOptions.length === 0}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {ORDER_STATUS_VALUES.map((s) => {
            const isValidTransition =
              s === currentStatus || validOptions.includes(s);
            return (
              <option key={s} value={s} disabled={!isValidTransition}>
                {getOrderStatusMeta(s).label}
              </option>
            );
          })}
        </select>
      </div>

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {validOptions.length === 0 && currentStatus !== status && (
        <p className="text-xs text-gray-500">
          Não há transições de status disponíveis
        </p>
      )}
    </div>
  );
}
