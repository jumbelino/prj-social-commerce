"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { ErrorPanel } from "@/components/error-panel";
import {
  ApiRequestError,
  createMercadoPagoPreference,
  createMercadoPagoPayment,
  createOrder,
  type MercadoPagoPreferenceResponse,
  type MercadoPagoPixPaymentResponse,
  type OrderRead,
} from "@/lib/api";
import { formatCents } from "@/lib/currency";

type CheckoutForm = {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
};

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return "Unexpected request failure.";
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, totalCents, clearCart, selectedShipping, destinationPostalCode } = useCart();

  const [form, setForm] = useState<CheckoutForm>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"checkout_pro" | "pix">("checkout_pro");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [paymentPreference, setPaymentPreference] = useState<MercadoPagoPreferenceResponse | null>(null);
  const [pixPayment, setPixPayment] = useState<MercadoPagoPixPaymentResponse | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isRedirectingToCart, setIsRedirectingToCart] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const shippingCents = selectedShipping?.priceCents ?? 0;
  const totalWithShippingCents = totalCents + shippingCents;
  const destinationPostalCodeDigits = destinationPostalCode ?? "";

  useEffect(() => {
    if (items.length === 0 || selectedShipping !== null) {
      setIsRedirectingToCart(false);
      return;
    }

    setIsRedirectingToCart(true);
    router.replace("/cart");
  }, [items.length, router, selectedShipping]);

  const canSubmit = useMemo(
    () =>
      items.length > 0 &&
      !isSubmitting &&
      !isRedirectingToCart &&
      selectedShipping !== null &&
      destinationPostalCodeDigits.length === 8 &&
      (paymentMethod === "checkout_pro" || paymentMethod === "pix"),
    [destinationPostalCodeDigits.length, isRedirectingToCart, isSubmitting, items.length, paymentMethod, selectedShipping],
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setOrderError(null);
    setPaymentError(null);
    setOrder(null);
    setPaymentPreference(null);
    setPixPayment(null);
    setIsRedirecting(false);

    if (!selectedShipping || destinationPostalCodeDigits.length !== 8) {
      setOrderError("Shipping selection is required. Return to cart and recalculate shipping.");
      setIsSubmitting(false);
      return;
    }

    try {
      const createdOrder = await createOrder({
        customer_name: form.customerName || undefined,
        customer_email: form.customerEmail || undefined,
        customer_phone: form.customerPhone || undefined,
        items: items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        shipping: {
          provider: "melhor_envio",
          service_id: selectedShipping.serviceId,
          service_name: selectedShipping.serviceName,
          delivery_days: selectedShipping.deliveryDays,
          price_cents: selectedShipping.priceCents,
          to_postal_code: destinationPostalCodeDigits,
          quote_json: (selectedShipping.quoteRaw as Record<string, unknown> | undefined) ?? null,
        },
      });

      setOrder(createdOrder);

      try {
        if (paymentMethod === "checkout_pro") {
          const preferenceResponse = await createMercadoPagoPreference(createdOrder.id);
          setPaymentPreference(preferenceResponse);
          clearCart();
          setIsRedirecting(true);
          window.setTimeout(() => {
            window.location.assign(preferenceResponse.init_point);
          }, 150);
        } else if (paymentMethod === "pix") {
          const pixResponse = await createMercadoPagoPayment(createdOrder.id);
          setPixPayment(pixResponse);
          clearCart();
        }
      } catch (error) {
        setPaymentError(messageFromError(error));
      }
    } catch (error) {
      setOrderError(messageFromError(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Checkout</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Create order and request payment</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Confirm customer details, shipping, and totals before proceeding to payment via Mercado Pago Checkout Pro or PIX.
        </p>
      </section>

      {items.length === 0 && !order ? (
        <section className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/70 px-5 py-8 text-center text-[var(--color-muted)]">
          Your cart is empty. <Link href="/" className="font-semibold text-slate-900 underline">Add products first</Link>.
        </section>
      ) : null}

      {items.length > 0 && selectedShipping === null ? (
        <section className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/70 px-5 py-8 text-center text-[var(--color-muted)]">
          {isRedirectingToCart
            ? "Shipping selection missing. Redirecting to cart..."
            : "Shipping selection is required before checkout."}{" "}
          <Link href="/cart" className="font-semibold text-slate-900 underline">
            Return to cart
          </Link>
          .
        </section>
      ) : null}

      {orderError ? <ErrorPanel title="Order creation failed" message={orderError} /> : null}

      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]"
        >
          <label className="block text-sm font-semibold text-slate-700" htmlFor="customerName">
            Name
            <input
              id="customerName"
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.customerName}
              onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
              placeholder="Customer name"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="customerEmail">
            Email
            <input
              id="customerEmail"
              type="email"
              required
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.customerEmail}
              onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))}
              placeholder="customer@email.com"
            />
          </label>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="customerPhone">
            Phone
            <input
              id="customerPhone"
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.customerPhone}
              onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))}
              placeholder="+55 11 99999-9999"
            />
          </label>

          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-slate-700">Payment method</legend>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm text-slate-800">
              <input
                type="radio"
                name="paymentMethod"
                value="checkout_pro"
                checked={paymentMethod === "checkout_pro"}
                onChange={() => setPaymentMethod("checkout_pro")}
              />
              <span>Mercado Pago Checkout Pro (card)</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm text-slate-800">
              <input
                type="radio"
                name="paymentMethod"
                value="pix"
                checked={paymentMethod === "pix"}
                onChange={() => setPaymentMethod("pix")}
              />
              <span>PIX (instant payment)</span>
            </label>
          </fieldset>

          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isSubmitting ? "Processing..." : paymentMethod === "checkout_pro" ? "Create order and go to payment" : "Create order with PIX"}
          </button>
        </form>

        <aside className="rounded-2xl border border-[var(--color-line)] bg-white/85 p-5">
          <h2 className="font-display text-2xl text-slate-900">Order summary</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {items.map((item) => (
              <li key={item.variantId} className="flex items-center justify-between gap-3">
                <span>{item.sku} x {item.quantity}</span>
                <span className="font-semibold">{formatCents(item.quantity * item.unitPriceCents)}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 rounded-xl border border-[var(--color-line)] bg-white p-3 text-sm text-slate-700">
            <p className="font-semibold text-slate-900">Selected shipping</p>
            {selectedShipping ? (
              <>
                <p className="mt-1">{selectedShipping.serviceName}</p>
                <p className="text-[var(--color-muted)]">{selectedShipping.deliveryDays} dias</p>
                <p className="text-[var(--color-muted)]">CEP destino: {destinationPostalCodeDigits}</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCents(selectedShipping.priceCents)}</p>
              </>
            ) : (
              <p className="mt-1 text-[var(--color-muted)]">No shipping selected.</p>
            )}
          </div>

          <dl className="mt-4 space-y-2 text-sm text-slate-700">
            <div className="flex items-center justify-between gap-3">
              <dt>Subtotal</dt>
              <dd className="font-semibold text-slate-900">{formatCents(totalCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>Shipping</dt>
              <dd className="font-semibold text-slate-900">{formatCents(shippingCents)}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-[var(--color-line)] pt-2 text-base">
              <dt className="font-semibold text-slate-900">Total</dt>
              <dd className="font-semibold text-slate-900">{formatCents(totalWithShippingCents)}</dd>
            </div>
          </dl>
        </aside>
      </section>

      {order ? (
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
          <h2 className="font-display text-3xl text-slate-900">Order created</h2>
          <p className="mt-2 text-sm text-slate-700">
            Order ID: <span className="font-semibold">{order.id}</span>
          </p>
          <p className="text-sm text-slate-700">
            Status: <span className="font-semibold">{order.status}</span>
          </p>
          <p className="text-sm text-slate-700">
            Total: <span className="font-semibold">{formatCents(order.total_cents)}</span>
          </p>
        </section>
      ) : null}

      {paymentError ? <ErrorPanel title="Payment request failed" message={paymentError} /> : null}

      {paymentPreference ? (
        <section className="space-y-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
          <h2 className="font-display text-3xl text-slate-900">Redirecting to payment</h2>
          <p className="text-sm text-slate-700">
            Preference ID: <span className="font-semibold">{paymentPreference.preference_id}</span>
          </p>
          <p className="text-sm text-slate-700">
            {isRedirecting ? "Opening Mercado Pago in this tab..." : "Use the link below to continue payment."}
          </p>
          <a
            href={paymentPreference.init_point}
            className="inline-block break-all text-sm font-semibold text-[var(--color-accent)] underline"
          >
            {paymentPreference.init_point}
          </a>
        </section>
      ) : null}

      {pixPayment ? (
        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
          <h2 className="font-display text-3xl text-slate-900">PIX Payment</h2>
          <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
            <p className="text-sm text-slate-700">
              Payment ID: <span className="font-semibold">{pixPayment.payment_id}</span>
            </p>
            <p className="text-sm text-slate-700">
              Status: <span className="font-semibold">{pixPayment.status}</span>
            </p>
            {pixPayment.external_reference ? (
              <p className="text-sm text-slate-700">
                Order Reference: <span className="font-semibold">{pixPayment.external_reference}</span>
              </p>
            ) : null}
          </div>

          {pixPayment.qr_code ? (
            <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">PIX Copy/Paste Code:</p>
              <code className="block break-all rounded bg-slate-50 p-3 text-xs font-mono text-slate-800">
                {pixPayment.qr_code}
              </code>
            </div>
          ) : null}

          {pixPayment.qr_code_base64 ? (
            <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">PIX QR Code:</p>
              <img
                src={`data:image/png;base64,${pixPayment.qr_code_base64}`}
                alt="PIX QR Code"
                className="max-w-[200px] rounded"
              />
            </div>
          ) : null}

          {pixPayment.ticket_url ? (
            <div className="rounded-lg border border-[var(--color-line)] bg-white p-4">
              <p className="mb-2 text-sm font-semibold text-slate-700">Boleto/Payment Ticket:</p>
              <a
                href={pixPayment.ticket_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-[var(--color-accent)] underline"
              >
                {pixPayment.ticket_url}
              </a>
            </div>
          ) : null}

          <p className="text-sm text-slate-600">
            Complete your payment using one of the methods above. The order will be confirmed after payment is received.
          </p>
        </section>
      ) : null}
    </div>
  );
}
