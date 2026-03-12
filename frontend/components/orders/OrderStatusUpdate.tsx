"use client";

import { useState } from "react";
import { updateAdminOrderStatus } from "@/lib/api";

const STATUS_LABELS: Record<string, string> = {
  pending: "Pendente",
  paid: "Pago",
  shipped: "Enviado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  paid: "bg-blue-100 text-blue-800",
  shipped: "bg-purple-100 text-purple-800",
  delivered: "bg-green-100 text-green-800",
  cancelled: "bg-red-100 text-red-800",
};

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ["paid", "cancelled"],
  paid: ["shipped", "cancelled"],
  shipped: ["delivered", "cancelled"],
  delivered: [],
  cancelled: [],
};

const ALL_STATUSES = ["pending", "paid", "shipped", "delivered", "cancelled"] as const;

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

  const handleUpdate = async (newStatus: string) => {
    if (newStatus === currentStatus) return;

    setIsLoading(true);
    setError(null);

    try {
      const updated = await updateAdminOrderStatus(orderId, newStatus);
      setStatus(updated.status);
      onUpdated?.(updated.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <span
          className={`px-2 py-1 rounded text-sm font-medium ${
            STATUS_COLORS[status] || "bg-gray-100 text-gray-800"
          }`}
        >
          {STATUS_LABELS[status] || status}
        </span>

        <select
          value={status}
          onChange={(e) => handleUpdate(e.target.value)}
          disabled={isLoading || validOptions.length === 0}
          className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm disabled:opacity-50"
        >
          {ALL_STATUSES.map((s) => {
            const isValidTransition =
              s === currentStatus || validOptions.includes(s);
            return (
              <option key={s} value={s} disabled={!isValidTransition}>
                {STATUS_LABELS[s]}
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
          No valid status transitions available
        </p>
      )}
    </div>
  );
}
