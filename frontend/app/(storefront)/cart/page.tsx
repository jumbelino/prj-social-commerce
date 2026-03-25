"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

import { useCart } from "@/components/cart-provider";
import { PublicHero } from "@/components/storefront/PublicShell";
import {
  PurchaseSectionCard,
  PurchaseSummaryCard,
  StatusCallout,
  SummaryRow,
} from "@/components/storefront/PurchaseFlow";
import { EmptyState } from "@/components/storefront/StateBlocks";
import {
  API_BASE_URL,
  ApiRequestError,
  getShippingQuotes,
  type ShippingOption,
  type ShippingQuoteRequest,
} from "@/lib/api";
import { formatCents } from "@/lib/currency";

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function formatPostalCode(value: string | null): string {
  if (!value) {
    return "-";
  }
  if (value.length !== 8) {
    return value;
  }
  return `${value.slice(0, 5)}-${value.slice(5)}`;
}

function buildItemsSignature(items: Array<{ variantId: string; quantity: number }>): string {
  const parts = [...items]
    .map((item) => ({
      variantId: item.variantId,
      quantity: item.quantity,
    }))
    .sort((left, right) => left.variantId.localeCompare(right.variantId))
    .map((item) => `${item.variantId}:${item.quantity}`);

  return parts.join("|");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function formatMissingDimensionsMessage(payload: unknown): string | null {
  if (!isRecord(payload) || !isRecord(payload.detail)) {
    return null;
  }

  const detail = payload.detail;
  const parts: string[] = [];
  if (typeof detail.message === "string" && detail.message.trim() !== "") {
    parts.push(detail.message.trim());
  }

  const missingDimensions = Array.isArray(detail.missing_dimensions) ? detail.missing_dimensions : [];
  const itemParts = missingDimensions
    .map((entry) => {
      if (!isRecord(entry)) {
        return null;
      }

      const sku = typeof entry.sku === "string" && entry.sku.trim() !== "" ? entry.sku.trim() : null;
      const variantId =
        typeof entry.variant_id === "string" && entry.variant_id.trim() !== "" ? entry.variant_id.trim() : null;
      const missingFields = Array.isArray(entry.missing_fields)
        ? entry.missing_fields.filter((value): value is string => typeof value === "string" && value.trim() !== "")
        : [];
      const title = sku ? `SKU ${sku}` : variantId ? `Variante ${variantId}` : "Variante";
      if (missingFields.length === 0) {
        return title;
      }

      return `${title} sem: ${missingFields.join(", ")}`;
    })
    .filter((value): value is string => value !== null);

  if (itemParts.length > 0) {
    parts.push(`Itens com medidas faltando: ${itemParts.join(" | ")}`);
  }

  return parts.length > 0 ? parts.join(". ") : null;
}

async function readMissingDimensionsMessage(payload: ShippingQuoteRequest): Promise<string | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/shipping/quotes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (response.status !== 409) {
      return null;
    }

    const rawPayload = (await response.json()) as unknown;
    return formatMissingDimensionsMessage(rawPayload);
  } catch {
    return null;
  }
}

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }

  return "Falha inesperada ao consultar o frete.";
}

export default function CartPage() {
  const router = useRouter();
  const {
    items,
    removeItem,
    updateQuantity,
    totalCents,
    destinationPostalCode,
    setDestinationPostalCode,
    selectedShipping,
    setSelectedShipping,
  } = useCart();

  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [isQuotingShipping, setIsQuotingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [staleShippingHint, setStaleShippingHint] = useState<string | null>(null);

  const postalCodeDigits = destinationPostalCode ?? "";
  const isPostalCodeValid = postalCodeDigits.length === 8;
  const canCalculateShipping = items.length > 0 && isPostalCodeValid && !isQuotingShipping;
  const shippingCents = selectedShipping?.priceCents ?? 0;
  const totalWithShippingCents = totalCents + shippingCents;
  const canContinue = items.length > 0 && selectedShipping !== null;

  const itemsSignature = useMemo(
    () =>
      buildItemsSignature(
        items.map((item) => ({
          variantId: item.variantId,
          quantity: item.quantity,
        })),
      ),
    [items],
  );
  const previousItemsSignatureRef = useRef(itemsSignature);

  useEffect(() => {
    if (previousItemsSignatureRef.current === "" && itemsSignature !== "") {
      previousItemsSignatureRef.current = itemsSignature;
      return;
    }

    if (previousItemsSignatureRef.current === itemsSignature) {
      return;
    }

    previousItemsSignatureRef.current = itemsSignature;

    const hadSelectedShipping = selectedShipping !== null;
    const hadShippingQuotes = shippingOptions.length > 0;

    if (hadSelectedShipping) {
      setSelectedShipping(null);
    }
    if (hadShippingQuotes) {
      setShippingOptions([]);
    }
    if (hadSelectedShipping || hadShippingQuotes) {
      setStaleShippingHint("Os itens mudaram. Recalcule o frete antes de seguir.");
    }
  }, [itemsSignature, selectedShipping, setSelectedShipping, shippingOptions.length]);

  async function handleCalculateShipping(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCalculateShipping) {
      return;
    }

    const payload: ShippingQuoteRequest = {
      to_postal_code: postalCodeDigits,
      items: items.map((item) => ({
        variant_id: item.variantId,
        quantity: item.quantity,
      })),
    };

    setIsQuotingShipping(true);
    setShippingError(null);

    try {
      const response = await getShippingQuotes(payload);
      setShippingOptions(response.options);
      setStaleShippingHint(null);

      if (selectedShipping) {
        const matchingOption = response.options.find((option) => option.service_id === selectedShipping.serviceId);
        if (!matchingOption) {
          setSelectedShipping(null);
        } else {
          setSelectedShipping({
            provider: "melhor_envio",
            serviceId: matchingOption.service_id,
            serviceName: matchingOption.name,
            priceCents: matchingOption.price_cents,
            deliveryDays: matchingOption.delivery_days,
            quoteRaw: matchingOption.raw_json,
          });
        }
      }
    } catch (error) {
      let nextMessage = messageFromError(error);

      if (error instanceof ApiRequestError && error.status === 409) {
        const backendDetailMessage = await readMissingDimensionsMessage(payload);
        if (backendDetailMessage) {
          nextMessage = backendDetailMessage;
        } else {
          nextMessage =
            "A cotacao de frete foi bloqueada porque uma ou mais variantes estao sem peso e dimensoes completas.";
        }
      } else if (error instanceof ApiRequestError && error.status === 404 && nextMessage === "variant not found") {
        nextMessage =
          "Um ou mais itens no carrinho nao estao mais disponiveis no catalogo. Remova-os e tente novamente.";
      }

      setSelectedShipping(null);
      setShippingOptions([]);
      setShippingError(nextMessage);
    } finally {
      setIsQuotingShipping(false);
    }
  }

  const shippingStatus = useMemo(() => {
    if (items.length === 0) {
      return null;
    }
    if (shippingError) {
      return {
        tone: "danger" as const,
        title: "Nao foi possivel cotar o frete",
        message: shippingError,
      };
    }
    if (isQuotingShipping) {
      return {
        tone: "neutral" as const,
        title: "Calculando frete",
        message: "Consultando opcoes disponiveis para o CEP informado.",
      };
    }
    if (staleShippingHint) {
      return {
        tone: "warning" as const,
        title: "Frete precisa ser atualizado",
        message: staleShippingHint,
      };
    }
    if (postalCodeDigits.length === 0) {
      return {
        tone: "neutral" as const,
        title: "Informe o CEP",
        message: "Digite o CEP de destino para liberar as opcoes de envio e o total final do pedido.",
      };
    }
    if (postalCodeDigits.length < 8) {
      return {
        tone: "warning" as const,
        title: "CEP incompleto",
        message: "O CEP precisa ter exatamente 8 digitos para calcular o frete.",
      };
    }
    if (selectedShipping) {
      return {
        tone: "success" as const,
        title: "Frete selecionado",
        message: `${selectedShipping.serviceName} em ${selectedShipping.deliveryDays} dia(s) por ${formatCents(
          selectedShipping.priceCents,
        )}.`,
      };
    }
    if (shippingOptions.length > 0) {
      return {
        tone: "warning" as const,
        title: "Escolha uma opcao de frete",
        message: "A cotacao foi carregada. Selecione uma opcao para destravar o checkout.",
      };
    }
    return {
      tone: "neutral" as const,
      title: "Frete pronto para calcular",
      message: "Com o CEP completo, voce ja pode consultar as opcoes de envio.",
    };
  }, [isQuotingShipping, items.length, postalCodeDigits.length, selectedShipping, shippingError, shippingOptions.length, staleShippingHint]);

  return (
    <div className="space-y-8">
      <PublicHero
        eyebrow="Jornada de compra"
        title="Revise o carrinho, escolha o frete e siga com clareza para o checkout."
        description="A jornada agora destaca itens, envio e total final em blocos visuais mais claros para reduzir erro e aumentar confianca antes do pagamento."
        actions={
          <>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
            >
              Continuar comprando
            </Link>
            <div className="inline-flex items-center justify-center rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)]">
              {items.length} {items.length === 1 ? "item" : "itens"} no carrinho
            </div>
          </>
        }
      />

      {items.length === 0 ? (
        <EmptyState
          title="Seu carrinho esta vazio"
          message="Ainda nao ha itens prontos para fechar o pedido. Volte ao catalogo para escolher uma camiseta e retomar a compra."
          action={
            <Link
              href="/"
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
            >
              Voltar ao catalogo
            </Link>
          }
        />
      ) : (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_360px] lg:items-start">
          <div className="space-y-6">
            <PurchaseSectionCard
              eyebrow="Itens"
              title="O que vai para o pedido"
              description="Confira titulo, variante, quantidade e subtotal de cada item antes de seguir."
            >
              <div className="space-y-4">
                {items.map((item) => (
                  <article
                    key={item.variantId}
                    className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)]/88 p-4 shadow-[0_12px_30px_rgba(0,0,0,0.16)]"
                  >
                    <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                      <div className="space-y-3">
                        <div>
                          <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
                            {item.productTitle}
                          </h2>
                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">SKU {item.sku}</p>
                        </div>

                        {item.attributes && Object.keys(item.attributes).length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(item.attributes).map(([key, value]) => (
                              <span
                                key={`${item.variantId}-${key}`}
                                className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)]"
                              >
                                {key}: {value}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-[var(--color-text-muted)]">Sem atributos adicionais.</p>
                        )}

                        <div className="grid gap-3 text-sm text-[var(--color-text-secondary)] sm:grid-cols-2">
                          <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                              Preco unitario
                            </p>
                            <p className="mt-1 font-semibold text-[var(--color-text-primary)]">
                              {formatCents(item.unitPriceCents)}
                            </p>
                          </div>
                          <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-3">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                              Subtotal do item
                            </p>
                            <p className="mt-1 font-semibold text-[var(--color-text-primary)]">
                              {formatCents(item.quantity * item.unitPriceCents)}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4 md:min-w-[210px]">
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                            Quantidade
                          </p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              type="button"
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] text-lg font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
                              onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                              aria-label={`Diminuir quantidade de ${item.productTitle}`}
                            >
                              -
                            </button>
                            <input
                              className="h-11 w-20 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] text-center text-sm font-semibold text-[var(--color-text-primary)] outline-none"
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(event) => {
                                const nextValue = Number(event.currentTarget.value);
                                if (!Number.isFinite(nextValue) || nextValue <= 0) {
                                  updateQuantity(item.variantId, 1);
                                  return;
                                }
                                updateQuantity(item.variantId, Math.floor(nextValue));
                              }}
                            />
                            <button
                              type="button"
                              className="flex h-11 w-11 items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] text-lg font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
                              onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                              aria-label={`Aumentar quantidade de ${item.productTitle}`}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          className="inline-flex rounded-xl border border-[var(--color-danger-text)]/24 bg-[var(--color-danger-bg)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-danger-text)] transition hover:border-[var(--color-danger-text)]/38"
                        >
                          Remover item
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </PurchaseSectionCard>

            <PurchaseSectionCard
              eyebrow="Frete"
              title="Calcule e escolha a entrega"
              description="O checkout so fica liberado depois que uma opcao de frete valida for escolhida."
            >
              <div className="space-y-4">
                {shippingStatus ? (
                  <StatusCallout
                    tone={shippingStatus.tone}
                    title={shippingStatus.title}
                    message={shippingStatus.message}
                  />
                ) : null}

                <form onSubmit={handleCalculateShipping} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="destinationPostalCode">
                    CEP de destino
                    <input
                      id="destinationPostalCode"
                      className={`mt-2 w-full rounded-xl border bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition ${
                        postalCodeDigits.length > 0 && postalCodeDigits.length < 8
                          ? "border-[var(--color-danger-text)]/40 focus:border-[var(--color-danger-text)]"
                          : "border-[var(--color-line)] focus:border-[var(--color-line-strong)]"
                      }`}
                      inputMode="numeric"
                      maxLength={8}
                      value={postalCodeDigits}
                      onChange={(event) => {
                        const nextPostalCode = digitsOnly(event.currentTarget.value).slice(0, 8);
                        setDestinationPostalCode(nextPostalCode.length > 0 ? nextPostalCode : null);
                      }}
                      placeholder="00000000"
                    />
                    <span className="mt-2 block text-xs text-[var(--color-text-muted)]">
                      Informe apenas os 8 digitos do CEP.
                    </span>
                    {postalCodeDigits.length > 0 && postalCodeDigits.length < 8 ? (
                      <span className="mt-1 block text-xs text-[var(--color-danger-text)]">
                        O CEP precisa ter exatamente 8 digitos.
                      </span>
                    ) : null}
                  </label>
                  <button
                    type="submit"
                    disabled={!canCalculateShipping}
                    className="inline-flex h-[50px] items-center justify-center rounded-xl bg-[var(--color-accent)] px-5 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    {isQuotingShipping ? "Calculando frete..." : "Calcular frete"}
                  </button>
                </form>

                {shippingOptions.length > 0 ? (
                  <div className="space-y-3">
                    {shippingOptions.map((option) => {
                      const isSelected = selectedShipping?.serviceId === option.service_id;

                      return (
                        <button
                          key={option.service_id}
                          type="button"
                          onClick={() => {
                            setSelectedShipping({
                              provider: "melhor_envio",
                              serviceId: option.service_id,
                              serviceName: option.name,
                              priceCents: option.price_cents,
                              deliveryDays: option.delivery_days,
                              quoteRaw: option.raw_json,
                            });
                            setStaleShippingHint(null);
                          }}
                          className={`flex w-full items-center justify-between gap-4 rounded-[22px] border px-4 py-4 text-left transition ${
                            isSelected
                              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_14px_32px_rgba(0,0,0,0.18)]"
                              : "border-[var(--color-line)] bg-[var(--color-surface-1)]/88 hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
                          }`}
                        >
                          <span>
                            <span className="block font-semibold text-[var(--color-text-primary)]">
                              {option.name}
                            </span>
                            <span className="mt-1 block text-sm text-[var(--color-text-secondary)]">
                              Entrega estimada em {option.delivery_days} dia(s).
                            </span>
                          </span>
                          <span className="text-right">
                            {isSelected ? (
                              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                                Selecionado
                              </span>
                            ) : null}
                            <span className="block font-semibold text-[var(--color-text-primary)]">
                              {formatCents(option.price_cents)}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </PurchaseSectionCard>
          </div>

          <div className="space-y-4 lg:sticky lg:top-24">
            <PurchaseSummaryCard
              eyebrow="Resumo"
              title="Total pronto para checkout"
              description="O resumo final so fica fechado depois da selecao do frete."
            >
              <div className="space-y-4">
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                  <dl className="space-y-3">
                    <SummaryRow label="Subtotal" value={formatCents(totalCents)} />
                    <SummaryRow
                      label="Frete"
                      value={selectedShipping ? formatCents(shippingCents) : "A definir"}
                    />
                    <div className="border-t border-[var(--color-line)] pt-3">
                      <SummaryRow label="Total" value={formatCents(totalWithShippingCents)} strong />
                    </div>
                  </dl>
                </div>

                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    Entrega
                  </p>
                  <p className="mt-2 font-semibold text-[var(--color-text-primary)]">
                    {selectedShipping ? selectedShipping.serviceName : "Frete ainda nao selecionado"}
                  </p>
                  <p className="mt-1 leading-6">
                    CEP: {formatPostalCode(destinationPostalCode)}
                    {selectedShipping ? ` · ${selectedShipping.deliveryDays} dia(s)` : ""}
                  </p>
                </div>

                {!canContinue ? (
                  <StatusCallout
                    tone="warning"
                    title="Ainda falta escolher o frete"
                    message="O checkout so sera liberado depois que uma opcao de frete for selecionada para o pedido."
                  />
                ) : (
                  <StatusCallout
                    tone="success"
                    title="Pronto para o checkout"
                    message="Itens e frete ja estao definidos. Voce pode seguir para os dados do cliente e pagamento."
                  />
                )}

                <button
                  type="button"
                  disabled={!canContinue}
                  onClick={() => router.push("/checkout")}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Ir para o checkout
                </button>
              </div>
            </PurchaseSummaryCard>
          </div>
        </section>
      )}
    </div>
  );
}
