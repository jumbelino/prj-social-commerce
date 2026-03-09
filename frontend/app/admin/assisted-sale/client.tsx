"use client";

import { useState, useEffect } from "react";
import { listProducts, type Product, type ProductVariant } from "@/lib/api";
import {
  createAdminOrder,
  getShippingQuotes,
  createMercadoPagoPreference,
  type OrderRead,
  type ShippingOption,
} from "@/lib/api";
import { formatCents } from "@/lib/currency";
import { ErrorPanel } from "@/components/error-panel";

interface CartItem {
  variant: ProductVariant;
  quantity: number;
  product: Product;
}

export function AssistedSaleClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cart, setCart] = useState<CartItem[]>([]);
  const [cep, setCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<OrderRead | null>(null);
  const [paymentLink, setPaymentLink] = useState<string | null>(null);

  useEffect(() => {
    async function loadProducts() {
      try {
        const data = await listProducts();
        setProducts(data.filter((p) => p.active && p.variants.length > 0));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load products");
      } finally {
        setIsLoading(false);
      }
    }
    loadProducts();
  }, []);

  const addToCart = (product: Product, variant: ProductVariant) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.variant.id === variant.id);
      if (existing) {
        return prev.map((item) =>
          item.variant.id === variant.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prev, { variant, quantity: 1, product }];
    });
  };

  const updateQuantity = (variantId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((item) => item.variant.id !== variantId));
    } else {
      setCart((prev) =>
        prev.map((item) =>
          item.variant.id === variantId ? { ...item, quantity } : item
        )
      );
    }
    setSelectedShipping(null);
    setShippingOptions([]);
  };

  const calculateShipping = async () => {
    if (!cep || cart.length === 0) return;
    setError(null);

    try {
      const result = await getShippingQuotes({
        to_postal_code: cep.replace(/\D/g, ""),
        items: cart.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
      });
      setShippingOptions(result.options);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to calculate shipping");
    }
  };

  const subtotal = cart.reduce(
    (sum, item) => sum + item.variant.price_cents * item.quantity,
    0
  );
  const shippingCents = selectedShipping?.price_cents ?? 0;
  const total = subtotal + shippingCents;

  const createOrder = async () => {
    if (!selectedShipping || cart.length === 0) {
      setError("Selecione uma opção de frete antes de criar o pedido");
      return;
    }

    setIsCreatingOrder(true);
    setError(null);

    try {
      const order = await createAdminOrder({
        customer_name: customerName || undefined,
        customer_email: customerEmail || undefined,
        customer_phone: customerPhone || undefined,
        items: cart.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
        shipping: {
          provider: "melhor_envio",
          service_id: selectedShipping.service_id,
          service_name: selectedShipping.name,
          delivery_days: selectedShipping.delivery_days,
          price_cents: selectedShipping.price_cents,
          to_postal_code: cep.replace(/\D/g, ""),
        },
      });

      setCreatedOrder(order);

      const preference = await createMercadoPagoPreference(order.id);
      setPaymentLink(preference.init_point);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create order");
    } finally {
      setIsCreatingOrder(false);
    }
  };

  const copyPaymentLink = () => {
    if (paymentLink) {
      navigator.clipboard.writeText(paymentLink);
    }
  };

  if (isLoading) {
    return <div className="p-8">Carregando produtos...</div>;
  }

  if (paymentLink && createdOrder) {
    return (
      <div className="space-y-5">
        <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
          <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Pedido Criado</h1>
          <p className="mt-2 text-[var(--color-muted)]">ID do Pedido: {createdOrder.id}</p>
        </section>

        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-display text-xl text-slate-900">Link de Pagamento</h2>
          <div className="mt-4 flex gap-2">
            <input
              type="text"
              value={paymentLink}
              readOnly
              className="flex-1 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
            />
            <button
              onClick={copyPaymentLink}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
            >
              Copiar
            </button>
          </div>
          <a
            href={paymentLink}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-block rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white"
          >
            Abrir Página de Pagamento
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Venda Assistida</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Crie pedidos em nome de clientes e gere links de pagamento.
        </p>
      </section>

      {error && <ErrorPanel title="Erro" message={error} />}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-display text-xl text-slate-900">Produtos</h2>
          <div className="mt-4 space-y-3 max-h-96 overflow-y-auto">
            {products.map((product) => (
              <div key={product.id} className="border-b border-[var(--color-line)] pb-3">
                <p className="font-semibold text-slate-900">{product.title}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {product.variants.map((variant) => (
                    <button
                      key={variant.id}
                      onClick={() => addToCart(product, variant)}
                      className="rounded bg-slate-100 px-2 py-1 text-xs hover:bg-slate-200"
                    >
                      {variant.sku} - {formatCents(variant.price_cents)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
          <h2 className="font-display text-xl text-slate-900">Carrinho</h2>
          {cart.length === 0 ? (
            <p className="mt-4 text-sm text-[var(--color-muted)]">Nenhum item no carrinho</p>
          ) : (
            <div className="mt-4 space-y-3">
              {cart.map((item) => (
                <div key={item.variant.id} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">{item.product.title}</p>
                    <p className="text-xs text-[var(--color-muted)]">{item.variant.sku}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => updateQuantity(item.variant.id, parseInt(e.target.value) || 0)}
                      className="w-16 rounded border border-[var(--color-line)] px-2 py-1 text-sm"
                      min="1"
                    />
                    <p className="text-sm font-medium">{formatCents(item.variant.price_cents * item.quantity)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="font-display text-xl text-slate-900">Informações do Cliente</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <input
            type="text"
            placeholder="Nome"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          />
          <input
            type="email"
            placeholder="Email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          />
          <input
            type="tel"
            placeholder="Telefone"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="font-display text-xl text-slate-900">Frete</h2>
        <div className="mt-4 flex gap-2">
          <input
            type="text"
            placeholder="CEP (8 dígitos)"
            value={cep}
            onChange={(e) => setCep(e.target.value.replace(/\D/g, "").slice(0, 8))}
            className="flex-1 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
          />
          <button
            onClick={calculateShipping}
            disabled={cep.length !== 8 || cart.length === 0}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
          >
            Calcular
          </button>
        </div>

        {shippingOptions.length > 0 && (
          <div className="mt-4 space-y-2">
            {shippingOptions.map((option) => (
              <label
                key={option.service_id}
                className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 ${
                  selectedShipping?.service_id === option.service_id
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                    : "border-[var(--color-line)]"
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="radio"
                    name="shipping"
                    checked={selectedShipping?.service_id === option.service_id}
                    onChange={() => setSelectedShipping(option)}
                  />
                  <div>
                    <p className="text-sm font-medium">{option.name}</p>
                    <p className="text-xs text-[var(--color-muted)]">{option.delivery_days} dias úteis</p>
                  </div>
                </div>
                <p className="font-medium">{formatCents(option.price_cents)}</p>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="font-display text-xl text-slate-900">Resumo</h2>
        <div className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Subtotal</span>
            <span>{formatCents(subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span>Frete</span>
            <span>{selectedShipping ? formatCents(shippingCents) : "-"}</span>
          </div>
          <div className="flex justify-between border-t border-[var(--color-line)] pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatCents(total)}</span>
          </div>
        </div>

        <button
          onClick={createOrder}
          disabled={!selectedShipping || cart.length === 0 || isCreatingOrder}
          className="mt-4 w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
        >
          {isCreatingOrder ? "Criando pedido..." : "Criar Pedido e Gerar Link de Pagamento"}
        </button>
      </section>
    </div>
  );
}
