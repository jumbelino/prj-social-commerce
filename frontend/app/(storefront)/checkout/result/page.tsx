"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { ErrorPanel } from "@/components/error-panel";
import {
  ApiRequestError,
  getOrderById,
  syncMercadoPagoPayment,
  type OrderRead,
} from "@/lib/api";
import { formatCents } from "@/lib/currency";

type CheckoutResultState = "success" | "pending" | "failure" | "unknown";

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "Could not confirm payment status right now.";
}

function normalizePaymentStatus(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "" ? null : normalized;
}

function resolveCheckoutResult(order: OrderRead, returnStatus: string | null): CheckoutResultState {
  const paymentStatus = normalizePaymentStatus(order.latest_payment_status) ?? normalizePaymentStatus(returnStatus);
  if (order.status === "paid" || paymentStatus === "approved") {
    return "success";
  }
  if (
    order.status === "cancelled" ||
    paymentStatus === "cancelled" ||
    paymentStatus === "rejected" ||
    paymentStatus === "expired" ||
    paymentStatus === "refunded" ||
    paymentStatus === "charged_back"
  ) {
    return "failure";
  }
  if (
    order.status === "pending" ||
    paymentStatus === "pending" ||
    paymentStatus === "in_process" ||
    paymentStatus === "in_mediation"
  ) {
    return "pending";
  }
  return "unknown";
}

function resultCopy(state: CheckoutResultState, paymentStatus: string | null): { title: string; description: string } {
  if (state === "success") {
    return {
      title: "Pagamento confirmado",
      description: "Seu pedido foi confirmado com sucesso e o estoque foi mantido reservado para expedição.",
    };
  }
  if (state === "pending") {
    return {
      title: "Pagamento pendente",
      description:
        "O pedido foi criado, mas o pagamento ainda não foi confirmado. Você pode aguardar alguns instantes e atualizar esta página.",
    };
  }
  if (state === "failure") {
    if (paymentStatus === "expired") {
      return {
        title: "Pagamento expirado",
        description: "O prazo do pagamento terminou. O pedido foi cancelado e o estoque foi devolvido.",
      };
    }
    if (paymentStatus === "rejected") {
      return {
        title: "Pagamento rejeitado",
        description: "O pagamento foi recusado pelo Mercado Pago. Revise os dados ou tente novamente com outro método.",
      };
    }
    return {
      title: "Pagamento não concluído",
      description: "O pedido não foi pago com sucesso. O estoque foi devolvido quando aplicável.",
    };
  }
  return {
    title: "Status ainda não confirmado",
    description:
      "A aplicação ainda não conseguiu determinar o resultado final do pagamento. Revise os dados abaixo e tente sincronizar novamente.",
  };
}

function CheckoutResultContent() {
  const searchParams = useSearchParams();
  const { clearCart } = useCart();

  const [order, setOrder] = useState<OrderRead | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const orderId = searchParams.get("order_id") ?? searchParams.get("external_reference");
  const paymentId = searchParams.get("payment_id") ?? searchParams.get("collection_id");
  const returnStatus = normalizePaymentStatus(searchParams.get("status"));

  const loadOrder = useCallback(async () => {
    if (!orderId) {
      setErrorMessage("Missing order reference in the Mercado Pago return URL.");
      setOrder(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    setWarningMessage(null);

    try {
      const syncedOrder = await syncMercadoPagoPayment({
        order_id: orderId,
        ...(paymentId ? { payment_id: paymentId } : {}),
        ...(returnStatus ? { payment_status: returnStatus } : {}),
      });
      setOrder(syncedOrder);
      return;
    } catch (error) {
      setWarningMessage(`Automatic payment sync failed: ${messageFromError(error)}`);
    }

    try {
      const fetchedOrder = await getOrderById(orderId);
      setOrder(fetchedOrder);
    } catch (error) {
      setOrder(null);
      setErrorMessage(messageFromError(error));
    } finally {
      setIsLoading(false);
    }
  }, [orderId, paymentId, returnStatus]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      await loadOrder();
      if (!cancelled) {
        setIsLoading(false);
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [loadOrder, reloadToken]);

  const resolvedState = useMemo(() => {
    if (!order) {
      return "unknown";
    }
    return resolveCheckoutResult(order, returnStatus);
  }, [order, returnStatus]);

  const paymentStatus = order?.latest_payment_status ?? returnStatus;
  const copy = resultCopy(resolvedState, paymentStatus);

  useEffect(() => {
    if (resolvedState === "success") {
      clearCart();
    }
  }, [clearCart, resolvedState]);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Checkout</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">{copy.title}</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">{copy.description}</p>
      </section>

      {isLoading ? (
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 text-sm text-slate-700">
          Sincronizando pedido e pagamento com o Mercado Pago...
        </section>
      ) : null}

      {errorMessage ? <ErrorPanel title="Falha ao carregar resultado do checkout" message={errorMessage} /> : null}
      {warningMessage ? <ErrorPanel title="Aviso de sincronização" message={warningMessage} /> : null}

      {order ? (
        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Pedido</p>
              <p className="mt-2 font-mono text-sm text-slate-900">{order.id}</p>
              <p className="mt-2 text-sm text-slate-700">
                Status do pedido: <span className="font-semibold">{order.status}</span>
              </p>
              <p className="text-sm text-slate-700">
                Total: <span className="font-semibold">{formatCents(order.total_cents)}</span>
              </p>
            </div>

            <div className="rounded-xl border border-[var(--color-line)] bg-white p-4">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--color-muted)]">Pagamento</p>
              <p className="mt-2 text-sm text-slate-700">
                Status do pagamento: <span className="font-semibold">{paymentStatus ?? "unknown"}</span>
              </p>
              <p className="text-sm text-slate-700">
                Payment ID: <span className="font-semibold">{paymentId ?? order.latest_payment_external_id ?? "-"}</span>
              </p>
              {order.expires_at ? (
                <p className="text-sm text-slate-700">
                  Expira em: <span className="font-semibold">{new Date(order.expires_at).toLocaleString("pt-BR")}</span>
                </p>
              ) : null}
            </div>
          </div>

          {resolvedState === "failure" && order.inventory_released_at ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              Estoque devolvido em {new Date(order.inventory_released_at).toLocaleString("pt-BR")}.
            </div>
          ) : null}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setReloadToken((current) => current + 1)}
              className="rounded-lg border border-[var(--color-line)] bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:border-slate-400"
            >
              Atualizar status
            </button>
            <Link
              href={resolvedState === "success" ? "/" : "/cart"}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:opacity-90"
            >
              {resolvedState === "success" ? "Voltar para a loja" : "Voltar para o carrinho"}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default function CheckoutResultPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-5">
          <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Checkout</p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Carregando resultado do pagamento</h1>
            <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
              Aguarde enquanto sincronizamos o pedido com o Mercado Pago.
            </p>
          </section>
        </div>
      }
    >
      <CheckoutResultContent />
    </Suspense>
  );
}
