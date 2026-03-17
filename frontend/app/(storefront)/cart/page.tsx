"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SyntheticEvent } from "react";

import { useCart } from "@/components/cart-provider";
import { ErrorPanel } from "@/components/error-panel";
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
      const title = sku ? `SKU ${sku}` : variantId ? `Variant ${variantId}` : "Variant";
      if (missingFields.length === 0) {
        return title;
      }

      return `${title} missing: ${missingFields.join(", ")}`;
    })
    .filter((value): value is string => value !== null);

  if (itemParts.length > 0) {
    parts.push(`Items requiring dimensions: ${itemParts.join(" | ")}`);
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

  return "Unexpected request failure.";
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
      setStaleShippingHint("Items changed. Recalculate shipping before continuing.");
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
            "Shipping quote blocked: one or more variants are missing dimensions (weight_kg, width_cm, height_cm, length_cm).";
        }
      } else if (error instanceof ApiRequestError && error.status === 404 && nextMessage === "variant not found") {
        nextMessage = "Um ou mais itens no seu carrinho não estão mais disponíveis no catálogo. Por favor, remova-os para recálculo.";
      }

      setSelectedShipping(null);
      setShippingOptions([]);
      setShippingError(nextMessage);
    } finally {
      setIsQuotingShipping(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Cart</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Your selected variants</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Review quantities before creating an order.
        </p>
      </section>

      {items.length === 0 ? (
        <section className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/70 px-5 py-8 text-center text-[var(--color-muted)]">
          Cart is empty. <Link href="/" className="font-semibold text-slate-900 underline">Go back to products</Link>.
        </section>
      ) : (
        <section className="space-y-4">
          {items.map((item) => (
            <article
              key={item.variantId}
              className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl text-slate-900">{item.productTitle}</h2>
                  <p className="text-sm text-[var(--color-muted)]">SKU: {item.sku}</p>
                  <p className="text-sm text-[var(--color-muted)]">{formatCents(item.unitPriceCents)} each</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="h-8 w-8 rounded-md border border-[var(--color-line)] text-lg font-semibold text-slate-700 hover:border-slate-400"
                    onClick={() => updateQuantity(item.variantId, item.quantity - 1)}
                  >
                    -
                  </button>
                  <input
                    className="h-8 w-14 rounded-md border border-[var(--color-line)] bg-white text-center text-sm"
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
                    className="h-8 w-8 rounded-md border border-[var(--color-line)] text-lg font-semibold text-slate-700 hover:border-slate-400"
                    onClick={() => updateQuantity(item.variantId, item.quantity + 1)}
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-800">Line total: {formatCents(item.quantity * item.unitPriceCents)}</p>
                <button
                  type="button"
                  onClick={() => removeItem(item.variantId)}
                  className="rounded-lg border border-[var(--color-line)] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--color-danger-text)] hover:border-[var(--color-danger-text)]/40"
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
        <h2 className="font-display text-2xl text-slate-900">Shipping</h2>

        <form onSubmit={handleCalculateShipping} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="block flex-1 text-sm font-semibold text-slate-700" htmlFor="destinationPostalCode">
            CEP de destino
            <input
              id="destinationPostalCode"
              className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm ${
                postalCodeDigits.length > 0 && postalCodeDigits.length < 8
                  ? "border-red-400 focus:border-red-500"
                  : "border-[var(--color-line)]"
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
            {postalCodeDigits.length > 0 && postalCodeDigits.length < 8 ? (
              <span className="mt-1 block text-xs text-red-600">CEP must have exactly 8 digits</span>
            ) : null}
          </label>
          <button
            type="submit"
            disabled={!canCalculateShipping}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isQuotingShipping ? "Calculando..." : "Calcular frete"}
          </button>
        </form>

        {staleShippingHint ? (
          <p className="text-sm text-[var(--color-muted)]">{staleShippingHint}</p>
        ) : null}

        {shippingError ? <ErrorPanel title="Shipping quote failed" message={shippingError} /> : null}

        {shippingOptions.length > 0 ? (
          <div className="space-y-2">
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
                  className={`flex w-full items-center justify-between gap-3 rounded-xl border px-3 py-2 text-left text-sm transition ${
                    isSelected
                      ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10"
                      : "border-[var(--color-line)] bg-white hover:border-slate-400"
                  }`}
                >
                  <span>
                    <span className="block font-semibold text-slate-900">{option.name}</span>
                    <span className="block text-[var(--color-muted)]">{option.delivery_days} dias</span>
                  </span>
                  <span className="font-semibold text-slate-900">{formatCents(option.price_cents)}</span>
                </button>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-[var(--color-line)] bg-white/85 px-5 py-4">
        <dl className="space-y-2 text-sm text-slate-700">
          <div className="flex items-center justify-between gap-3">
            <dt>Subtotal</dt>
            <dd className="font-semibold text-slate-900">{formatCents(totalCents)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt>Frete</dt>
            <dd className="font-semibold text-slate-900">{formatCents(shippingCents)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-2 text-base">
            <dt className="font-semibold text-slate-900">Total</dt>
            <dd className="font-semibold text-slate-900">{formatCents(totalWithShippingCents)}</dd>
          </div>
        </dl>

        <button
          type="button"
          disabled={!canContinue}
          onClick={() => router.push("/checkout")}
          className="mt-3 inline-flex rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
        >
          Continue to checkout
        </button>
      </section>
    </div>
  );
}
