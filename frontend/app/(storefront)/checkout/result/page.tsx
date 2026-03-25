"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { PublicHero } from "@/components/storefront/PublicShell";
import {
  PurchaseSectionCard,
  PurchaseSummaryCard,
  StatusCallout,
  SummaryRow,
} from "@/components/storefront/PurchaseFlow";
import { ErrorState, LoadingState } from "@/components/storefront/StateBlocks";
import { ApiRequestError, getOrderById, syncMercadoPagoPayment, type OrderRead } from "@/lib/api";
import { formatCents } from "@/lib/currency";

type CheckoutResultState = "success" | "pending" | "failure" | "unknown";

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  if (error instanceof Error && error.message.trim() !== "") {
    return error.message;
  }
  return "Nao foi possivel confirmar o pagamento agora.";
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

function resultCopy(
  state: CheckoutResultState,
  paymentStatus: string | null,
): { title: string; description: string; tone: "success" | "warning" | "danger" | "neutral" } {
  if (state === "success") {
    return {
      title: "Pagamento confirmado",
      description: "Seu pedido foi confirmado e o fluxo de compra foi concluido com sucesso.",
      tone: "success",
    };
  }
  if (state === "pending") {
    return {
      title: "Pagamento pendente",
      description: "O pedido existe, mas o Mercado Pago ainda nao confirmou o pagamento. Aguarde alguns instantes e atualize o status.",
      tone: "warning",
    };
  }
  if (state === "failure") {
    if (paymentStatus === "expired") {
      return {
        title: "Pagamento expirado",
        description: "O prazo do pagamento terminou. O pedido foi cancelado e o estoque voltou a ficar disponivel.",
        tone: "danger",
      };
    }
    if (paymentStatus === "rejected") {
      return {
        title: "Pagamento rejeitado",
        description: "O Mercado Pago recusou o pagamento. Revise os dados e tente novamente pelo carrinho.",
        tone: "danger",
      };
    }
    return {
      title: "Pagamento nao concluido",
      description: "O pagamento nao foi finalizado com sucesso. O estoque foi devolvido quando aplicavel.",
      tone: "danger",
    };
  }
  return {
    title: "Status ainda indefinido",
    description: "A aplicacao ainda nao conseguiu determinar o resultado final do pagamento. Tente sincronizar novamente.",
    tone: "neutral",
  };
}

function nextStepCopy(state: CheckoutResultState): { label: string; href: string } {
  if (state === "success") {
    return { label: "Voltar para a loja", href: "/" };
  }
  if (state === "failure") {
    return { label: "Voltar para o carrinho", href: "/cart" };
  }
  if (state === "pending") {
    return { label: "Voltar para a loja", href: "/" };
  }
  return { label: "Voltar para o carrinho", href: "/cart" };
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
      setErrorMessage("A URL de retorno nao trouxe a referencia do pedido.");
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
      setWarningMessage(`Nao foi possivel sincronizar automaticamente: ${messageFromError(error)}`);
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
  const nextStep = nextStepCopy(resolvedState);

  useEffect(() => {
    if (resolvedState === "success") {
      clearCart();
    }
  }, [clearCart, resolvedState]);

  return (
    <div className="space-y-8">
      <PublicHero
        eyebrow="Resultado do checkout"
        title={copy.title}
        description={copy.description}
        actions={
          <>
            <Link
              href={nextStep.href}
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
            >
              {nextStep.label}
            </Link>
            <button
              type="button"
              onClick={() => setReloadToken((current) => current + 1)}
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
            >
              Atualizar status
            </button>
          </>
        }
      />

      {isLoading ? (
        <LoadingState
          title="Sincronizando pedido e pagamento"
          message="Aguarde enquanto conferimos o retorno do Mercado Pago e atualizamos o estado do pedido."
        />
      ) : null}

      {!isLoading ? (
        <StatusCallout tone={copy.tone} title={copy.title} message={copy.description} />
      ) : null}

      {warningMessage ? (
        <StatusCallout tone="warning" title="Aviso de sincronizacao" message={warningMessage} />
      ) : null}

      {errorMessage ? (
        <ErrorState
          title="Nao foi possivel carregar o resultado"
          message={errorMessage}
          action={
            <button
              type="button"
              onClick={() => setReloadToken((current) => current + 1)}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
            >
              Tentar novamente
            </button>
          }
        />
      ) : null}

      {order ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.02fr)_360px] lg:items-start">
          <div className="space-y-6">
            <PurchaseSectionCard
              eyebrow="Pedido"
              title="Estado atual do pedido"
              description="Aqui voce ve o que ja foi confirmado e o que ainda depende do pagamento."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Pedido</p>
                  <p className="mt-2 font-mono text-sm text-[var(--color-text-primary)]">{order.id}</p>
                  <p className="mt-2">
                    Status do pedido:{" "}
                    <span className="font-semibold text-[var(--color-text-primary)]">{order.status}</span>
                  </p>
                  <p>
                    Total: <span className="font-semibold text-[var(--color-text-primary)]">{formatCents(order.total_cents)}</span>
                  </p>
                </div>

                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Pagamento</p>
                  <p className="mt-2">
                    Status do pagamento:{" "}
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {paymentStatus ?? "indefinido"}
                    </span>
                  </p>
                  <p className="mt-1">
                    ID do pagamento:{" "}
                    <span className="font-semibold text-[var(--color-text-primary)]">
                      {paymentId ?? order.latest_payment_external_id ?? "-"}
                    </span>
                  </p>
                  {order.expires_at ? (
                    <p className="mt-1">
                      Expira em:{" "}
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {new Date(order.expires_at).toLocaleString("pt-BR")}
                      </span>
                    </p>
                  ) : null}
                </div>
              </div>

              {resolvedState === "failure" && order.inventory_released_at ? (
                <div className="mt-4">
                  <StatusCallout
                    tone="danger"
                    title="Estoque devolvido"
                    message={`O estoque voltou a ficar disponivel em ${new Date(
                      order.inventory_released_at,
                    ).toLocaleString("pt-BR")}.`}
                  />
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-3">
                {resolvedState === "pending" ? (
                  <StatusCallout
                    tone="warning"
                    title="Proxima acao"
                    message="Aguarde a confirmacao do pagamento e use Atualizar status para sincronizar novamente."
                  />
                ) : null}
                {resolvedState === "unknown" ? (
                  <StatusCallout
                    tone="neutral"
                    title="Proxima acao"
                    message="Tente sincronizar novamente. Se o status seguir indefinido, volte ao carrinho e reinicie a compra."
                  />
                ) : null}
              </div>
            </PurchaseSectionCard>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
            <PurchaseSummaryCard
              eyebrow="Resumo final"
              title="Leitura rapida do retorno"
              description="Um resumo curto para voce entender o estado da compra sem precisar interpretar payload ou termos tecnicos."
            >
              <div className="space-y-4">
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                  <dl className="space-y-3">
                    <SummaryRow label="Pedido" value={order.status} />
                    <SummaryRow label="Pagamento" value={paymentStatus ?? "indefinido"} />
                    <SummaryRow label="Total" value={formatCents(order.total_cents)} strong />
                  </dl>
                </div>

                <StatusCallout
                  tone={copy.tone}
                  title={copy.title}
                  message={
                    resolvedState === "success"
                      ? "Pedido pago e jornada encerrada com sucesso."
                      : resolvedState === "pending"
                        ? "Pedido criado, aguardando retorno final do pagamento."
                        : resolvedState === "failure"
                          ? "Pedido nao concluido. Recomece pelo carrinho quando quiser."
                          : "O sistema ainda nao conseguiu fechar o status final desta compra."
                  }
                />

                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setReloadToken((current) => current + 1)}
                    className="inline-flex flex-1 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
                  >
                    Atualizar status
                  </button>
                  <Link
                    href={nextStep.href}
                    className="inline-flex flex-1 items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
                  >
                    {nextStep.label}
                  </Link>
                </div>
              </div>
            </PurchaseSummaryCard>
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
        <div className="space-y-8">
          <PublicHero
            eyebrow="Resultado do checkout"
            title="Carregando resultado do pagamento"
            description="Aguarde enquanto sincronizamos o pedido com o Mercado Pago para mostrar o estado final."
          />
        </div>
      }
    >
      <CheckoutResultContent />
    </Suspense>
  );
}
