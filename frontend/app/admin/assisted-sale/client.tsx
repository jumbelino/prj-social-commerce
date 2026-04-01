"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  ApiRequestError,
  createAdminOrder,
  createMercadoPagoPreference,
  getShippingQuotes,
  listAdminProducts,
  searchAdminCustomers,
  type MercadoPagoPreferenceResponse,
  type CustomerRead,
  type OrderRead,
  type Product,
  type ProductVariant,
  type ShippingOption,
} from "@/lib/api";
import { formatCents } from "@/lib/currency";
import { ErrorPanel } from "@/components/error-panel";

type DeliveryMethod = "shipping" | "pickup";

type CartItem = {
  product: Product;
  variant: ProductVariant;
  quantity: number;
};

const PRODUCT_PAGE_SIZE = 20;
const CUSTOMER_PAGE_SIZE = 8;

function formatVariantLabel(variant: ProductVariant): string {
  const entries = Object.entries(variant.attributes_json ?? {});
  if (entries.length === 0) {
    return variant.sku;
  }

  return `${variant.sku} • ${entries
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" • ")}`;
}

function buildVariantMap(products: Product[]): Map<string, { product: Product; variant: ProductVariant }> {
  const map = new Map<string, { product: Product; variant: ProductVariant }>();
  for (const product of products) {
    for (const variant of product.variants) {
      map.set(variant.id, { product, variant });
    }
  }
  return map;
}

function formatDeliveryMethodLabel(deliveryMethod: DeliveryMethod): string {
  return deliveryMethod === "shipping" ? "Envio" : "Retirada";
}

function normalizeApiError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) {
    return error instanceof Error ? error.message : "Nao foi possivel concluir a acao.";
  }

  const message = error.message;

  if (message.includes("insufficient stock")) {
    return "Estoque insuficiente para um dos itens selecionados.";
  }
  if (message.includes("shipping is required")) {
    return "Selecione um frete antes de criar o pedido.";
  }
  if (message.includes("variant not found")) {
    return "Uma das variacoes selecionadas nao foi encontrada.";
  }

  return message;
}

export function AssistedSaleClient() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoadingProducts, setIsLoadingProducts] = useState(true);
  const [productSearch, setProductSearch] = useState("");
  const [productsError, setProductsError] = useState<string | null>(null);

  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [draftQuantity, setDraftQuantity] = useState<number>(1);
  const [cart, setCart] = useState<CartItem[]>([]);

  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<CustomerRead[]>([]);
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);

  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");

  const [deliveryMethod, setDeliveryMethod] = useState<DeliveryMethod>("shipping");
  const [cep, setCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedShipping, setSelectedShipping] = useState<ShippingOption | null>(null);
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);
  const [shippingMessage, setShippingMessage] = useState<string | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [createdOrder, setCreatedOrder] = useState<OrderRead | null>(null);
  const [paymentPreference, setPaymentPreference] = useState<MercadoPagoPreferenceResponse | null>(null);
  const [paymentLinkMessage, setPaymentLinkMessage] = useState<string | null>(null);
  const [paymentLinkError, setPaymentLinkError] = useState<string | null>(null);
  const [isGeneratingPaymentLink, setIsGeneratingPaymentLink] = useState(false);

  useEffect(() => {
    let isActive = true;

    async function loadProducts() {
      setIsLoadingProducts(true);
      setProductsError(null);
      try {
        const data = await listAdminProducts({
          active: true,
          query: productSearch || undefined,
          limit: PRODUCT_PAGE_SIZE,
          offset: 0,
        });
        if (!isActive) {
          return;
        }
        setProducts(data.filter((product) => product.variants.length > 0));
      } catch (error) {
        if (!isActive) {
          return;
        }
        setProductsError(normalizeApiError(error));
      } finally {
        if (isActive) {
          setIsLoadingProducts(false);
        }
      }
    }

    const timer = window.setTimeout(loadProducts, productSearch ? 250 : 0);
    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [productSearch]);

  useEffect(() => {
    let isActive = true;

    async function loadCustomers() {
      if (customerSearch.trim().length < 2) {
        setCustomerResults([]);
        return;
      }

      setIsLoadingCustomers(true);
      try {
        const results = await searchAdminCustomers({
          query: customerSearch.trim(),
          limit: CUSTOMER_PAGE_SIZE,
          offset: 0,
        });
        if (isActive) {
          setCustomerResults(results);
        }
      } catch {
        if (isActive) {
          setCustomerResults([]);
        }
      } finally {
        if (isActive) {
          setIsLoadingCustomers(false);
        }
      }
    }

    const timer = window.setTimeout(loadCustomers, 250);
    return () => {
      isActive = false;
      window.clearTimeout(timer);
    };
  }, [customerSearch]);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const selectedVariant =
    selectedProduct?.variants.find((variant) => variant.id === selectedVariantId) ?? null;

  const subtotalCents = cart.reduce(
    (total, item) => total + item.variant.price_cents * item.quantity,
    0,
  );
  const shippingCents = deliveryMethod === "shipping" ? selectedShipping?.price_cents ?? 0 : 0;
  const totalCents = subtotalCents + shippingCents;

  const needsCustomerName = customerName.trim() === "";
  const needsCustomerContact = customerEmail.trim() === "" && customerPhone.trim() === "";
  const needsItems = cart.length === 0;
  const needsShippingSelection = deliveryMethod === "shipping" && selectedShipping === null;
  const canCreateOrder =
    !needsItems &&
    !needsCustomerName &&
    !needsCustomerContact &&
    (deliveryMethod === "pickup" || (cep.length === 8 && selectedShipping !== null));

  const variantLookup = buildVariantMap(products);

  function invalidateShipping(reason?: string) {
    setSelectedShipping(null);
    setShippingOptions([]);
    setShippingMessage(reason ?? null);
  }

  function resetFlowForNewOrder() {
    setCart([]);
    setCustomerSearch("");
    setCustomerResults([]);
    setSelectedCustomerId(null);
    setCustomerName("");
    setCustomerEmail("");
    setCustomerPhone("");
    setDeliveryMethod("shipping");
    setCep("");
    setShippingOptions([]);
    setSelectedShipping(null);
    setShippingMessage(null);
    setCreatedOrder(null);
    setPaymentPreference(null);
    setPaymentLinkMessage(null);
    setPaymentLinkError(null);
    setErrorMessage(null);
    setDraftQuantity(1);
    setSelectedProductId("");
    setSelectedVariantId("");
  }

  function handleSelectProduct(productId: string) {
    setSelectedProductId(productId);
    const product = products.find((entry) => entry.id === productId) ?? null;
    const nextVariant = product?.variants.find((variant) => variant.stock > 0) ?? product?.variants[0] ?? null;
    setSelectedVariantId(nextVariant?.id ?? "");
    setDraftQuantity(1);
  }

  function handleAddItem() {
    setErrorMessage(null);

    if (selectedProduct === null || selectedVariant === null) {
      setErrorMessage("Selecione um produto e uma variacao antes de adicionar.");
      return;
    }

    if (draftQuantity < 1) {
      setErrorMessage("A quantidade deve ser maior que zero.");
      return;
    }

    if (selectedVariant.stock < draftQuantity) {
      setErrorMessage("A quantidade selecionada excede o estoque disponivel.");
      return;
    }

    setCart((current) => {
      const existingItem = current.find((item) => item.variant.id === selectedVariant.id);
      if (!existingItem) {
        return [...current, { product: selectedProduct, variant: selectedVariant, quantity: draftQuantity }];
      }

      const nextQuantity = existingItem.quantity + draftQuantity;
      if (nextQuantity > selectedVariant.stock) {
        setErrorMessage("Nao ha estoque suficiente para somar essa quantidade.");
        return current;
      }

      return current.map((item) =>
        item.variant.id === selectedVariant.id ? { ...item, quantity: nextQuantity } : item,
      );
    });

    if (deliveryMethod === "shipping") {
      invalidateShipping("Itens alterados. Recalcule o frete antes de criar o pedido.");
    }
  }

  function updateItemQuantity(variantId: string, nextQuantity: number) {
    setErrorMessage(null);

    if (nextQuantity <= 0) {
      setCart((current) => current.filter((item) => item.variant.id !== variantId));
    } else {
      const availableStock = variantLookup.get(variantId)?.variant.stock;
      if (availableStock !== undefined && nextQuantity > availableStock) {
        setErrorMessage("A quantidade informada excede o estoque disponivel.");
        return;
      }

      setCart((current) =>
        current.map((item) => (item.variant.id === variantId ? { ...item, quantity: nextQuantity } : item)),
      );
    }

    if (deliveryMethod === "shipping") {
      invalidateShipping("Itens alterados. Recalcule o frete antes de criar o pedido.");
    }
  }

  function removeItem(variantId: string) {
    setCart((current) => current.filter((item) => item.variant.id !== variantId));
    setErrorMessage(null);
    if (deliveryMethod === "shipping") {
      invalidateShipping("Itens alterados. Recalcule o frete antes de criar o pedido.");
    }
  }

  function selectCustomer(customer: CustomerRead) {
    setSelectedCustomerId(customer.id);
    setCustomerName(customer.name ?? "");
    setCustomerEmail(customer.email ?? "");
    setCustomerPhone(customer.phone ?? "");
    setCustomerResults([]);
    setCustomerSearch(customer.email ?? customer.name ?? customer.phone ?? "");
    setErrorMessage(null);
  }

  function updateCustomerField(
    field: "name" | "email" | "phone",
    value: string,
  ) {
    setSelectedCustomerId(null);
    setErrorMessage(null);

    if (field === "name") setCustomerName(value);
    if (field === "email") setCustomerEmail(value);
    if (field === "phone") setCustomerPhone(value);
  }

  function handleChangeDeliveryMethod(nextMethod: DeliveryMethod) {
    if (nextMethod === deliveryMethod) {
      return;
    }

    setDeliveryMethod(nextMethod);
    setErrorMessage(null);
    setShippingMessage(null);

    if (nextMethod === "pickup") {
      setCep("");
      setShippingOptions([]);
      setSelectedShipping(null);
    } else {
      invalidateShipping("Selecione e calcule o frete para envio.");
    }
  }

  function handleCepChange(value: string) {
    const normalized = value.replace(/\D/g, "").slice(0, 8);
    const changed = normalized !== cep;
    setCep(normalized);
    setErrorMessage(null);

    if (deliveryMethod === "shipping" && changed && selectedShipping !== null) {
      invalidateShipping("CEP alterado. Recalcule o frete antes de criar o pedido.");
    }
  }

  async function calculateShipping() {
    if (deliveryMethod !== "shipping") {
      return;
    }
    if (cart.length === 0) {
      setErrorMessage("Adicione itens ao pedido antes de calcular o frete.");
      return;
    }
    if (cep.length !== 8) {
      setErrorMessage("Informe um CEP valido com 8 digitos.");
      return;
    }

    setIsCalculatingShipping(true);
    setErrorMessage(null);
    setShippingMessage(null);

    try {
      const response = await getShippingQuotes({
        to_postal_code: cep,
        items: cart.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
      });

      setShippingOptions(response.options);
      setSelectedShipping(null);
      setShippingMessage(
        response.options.length > 0
          ? "Selecione uma opcao de frete para concluir o pedido."
          : "Nenhuma opcao de frete disponivel para esse CEP.",
      );
    } catch (error) {
      setShippingOptions([]);
      setSelectedShipping(null);
      setErrorMessage(normalizeApiError(error));
    } finally {
      setIsCalculatingShipping(false);
    }
  }

  async function handleCreateOrder() {
    setErrorMessage(null);

    if (needsItems) {
      setErrorMessage("Adicione pelo menos um item antes de criar o pedido.");
      return;
    }
    if (needsCustomerName) {
      setErrorMessage("Informe o nome do cliente.");
      return;
    }
    if (needsCustomerContact) {
      setErrorMessage("Informe pelo menos um contato do cliente: email ou telefone.");
      return;
    }
    if (deliveryMethod === "shipping" && cep.length !== 8) {
      setErrorMessage("Informe um CEP valido antes de criar um pedido com envio.");
      return;
    }
    if (needsShippingSelection) {
      setErrorMessage("Selecione um frete antes de criar um pedido com envio.");
      return;
    }

    setIsCreatingOrder(true);

    try {
      const order = await createAdminOrder({
        delivery_method: deliveryMethod,
        customer_name: customerName.trim(),
        customer_email: customerEmail.trim() || undefined,
        customer_phone: customerPhone.trim() || undefined,
        items: cart.map((item) => ({
          variant_id: item.variant.id,
          quantity: item.quantity,
        })),
        shipping:
          deliveryMethod === "shipping" && selectedShipping !== null
            ? {
                provider: "melhor_envio",
                service_id: selectedShipping.service_id,
                service_name: selectedShipping.name,
                delivery_days: selectedShipping.delivery_days,
                price_cents: selectedShipping.price_cents,
                to_postal_code: cep,
                quote_json: selectedShipping.raw_json,
              }
            : undefined,
      });

      setCreatedOrder(order);
      setPaymentPreference(null);
      setPaymentLinkMessage("Pedido criado. Gere o link de pagamento quando quiser enviar ao cliente.");
      setPaymentLinkError(null);
      setShippingMessage(null);
    } catch (error) {
      setErrorMessage(normalizeApiError(error));
    } finally {
      setIsCreatingOrder(false);
    }
  }

  async function handleGeneratePaymentLink() {
    if (createdOrder === null) {
      setPaymentLinkError("Crie o pedido antes de gerar o link de pagamento.");
      return;
    }

    setIsGeneratingPaymentLink(true);
    setPaymentLinkError(null);
    setPaymentLinkMessage(null);

    try {
      const preference = await createMercadoPagoPreference(createdOrder.id);
      setPaymentPreference(preference);
      setPaymentLinkMessage("Link de pagamento gerado com sucesso.");
    } catch (error) {
      setPaymentPreference(null);
      setPaymentLinkError(normalizeApiError(error));
    } finally {
      setIsGeneratingPaymentLink(false);
    }
  }

  async function handleCopyPaymentLink() {
    if (paymentPreference === null) {
      return;
    }

    try {
      await navigator.clipboard.writeText(paymentPreference.checkout_url);
      setPaymentLinkMessage("Link copiado para a area de transferencia.");
      setPaymentLinkError(null);
    } catch {
      setPaymentLinkError("Nao foi possivel copiar o link automaticamente.");
    }
  }

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-[var(--color-text)]">Venda Assistida</h1>
            <p className="mt-2 max-w-3xl text-base text-[var(--color-muted)]">
              Monte um pedido manualmente, escolha o cliente e confirme a forma de entrega antes de criar o pedido.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-3 text-sm text-[var(--color-muted)]">
            <p className="font-medium text-[var(--color-text)]">Estado atual</p>
            <p className="mt-1">
              {createdOrder ? "Pedido criado com sucesso." : "Montando pedido assistido."}
            </p>
          </div>
        </div>
      </section>

      {errorMessage && <ErrorPanel title="Erro operacional" message={errorMessage} />}
      {productsError && <ErrorPanel title="Erro ao carregar produtos" message={productsError} />}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.95fr)]">
        <div className="space-y-6">
          <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Buscar cliente existente
                </label>
                <input
                  type="text"
                  placeholder="Nome, email ou telefone"
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  aria-label="Buscar cliente existente"
                  className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                />
              </div>
              <div className="rounded-lg bg-[var(--color-surface-1)] px-3 py-2 text-xs text-[var(--color-muted)]">
                {isLoadingCustomers ? "Buscando clientes..." : "Preencha manualmente se nao encontrar o cliente."}
              </div>
            </div>

            {customerResults.length > 0 && (
              <div className="mt-4 space-y-2">
                {customerResults.map((customer) => (
                  <button
                    key={customer.id}
                    type="button"
                    onClick={() => selectCustomer(customer)}
                    className="flex w-full items-center justify-between rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-3 text-left transition hover:border-[var(--color-line-strong)]"
                  >
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{customer.name || "Cliente sem nome"}</p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {customer.email || customer.phone || "Sem contato"}
                      </p>
                    </div>
                    <span className="text-xs font-medium text-[var(--color-accent)]">Usar cliente</span>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Nome
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(event) => updateCustomerField("name", event.target.value)}
                  aria-label="Nome do cliente"
                  className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Email
                </label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={(event) => updateCustomerField("email", event.target.value)}
                  aria-label="Email do cliente"
                  className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(event) => updateCustomerField("phone", event.target.value)}
                  aria-label="Telefone do cliente"
                  className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-[var(--color-muted)]">
              <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1">Nome obrigatorio</span>
              <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1">Email ou telefone obrigatorio</span>
              {selectedCustomerId !== null && (
                <span className="rounded-full bg-[var(--color-accent)]/10 px-3 py-1 text-[var(--color-accent)]">
                  Cliente existente selecionado
                </span>
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
              <div className="flex-1">
                <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Buscar produto
                </label>
                <input
                  type="text"
                  placeholder="Titulo ou SKU"
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  aria-label="Buscar produto"
                  className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                />
              </div>
              <div className="rounded-lg bg-[var(--color-surface-1)] px-3 py-2 text-xs text-[var(--color-muted)]">
                {isLoadingProducts ? "Carregando produtos..." : `${products.length} produto(s) carregado(s)`}
              </div>
            </div>

            <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.95fr)]">
              <div className="space-y-2 rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Resultados
                </p>
                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {products.length === 0 && !isLoadingProducts ? (
                    <p className="rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-6 text-sm text-[var(--color-muted)]">
                      Nenhum produto ativo encontrado.
                    </p>
                  ) : (
                    products.map((product) => {
                      const isSelected = product.id === selectedProductId;
                      const hasStock = product.variants.some((variant) => variant.stock > 0);
                      return (
                        <button
                          key={product.id}
                          type="button"
                          onClick={() => handleSelectProduct(product.id)}
                          className={`w-full rounded-xl border px-4 py-3 text-left transition ${
                            isSelected
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                              : "border-[var(--color-line)] bg-[var(--color-surface-1)] hover:border-[var(--color-line-strong)]"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-text)]">{product.title}</p>
                              <p className="mt-1 text-xs text-[var(--color-muted)]">
                                {product.variants.length} variacao(oes)
                              </p>
                            </div>
                            <span
                              className={`rounded-full px-2 py-1 text-[11px] font-semibold ${
                                hasStock
                                  ? "bg-emerald-500/20 text-emerald-300"
                                  : "bg-rose-100 text-rose-700"
                              }`}
                            >
                              {hasStock ? "Com estoque" : "Sem estoque"}
                            </span>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Adicionar item
                </p>

                {!selectedProduct ? (
                  <p className="mt-4 text-sm text-[var(--color-muted)]">
                    Selecione um produto na lista para escolher a variacao e a quantidade.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <p className="text-sm font-semibold text-[var(--color-text)]">{selectedProduct.title}</p>
                      {selectedProduct.description ? (
                        <p className="mt-1 text-sm text-[var(--color-muted)]">{selectedProduct.description}</p>
                      ) : null}
                    </div>

                    <div>
                      <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Variacao
                      </label>
                      <select
                        value={selectedVariantId}
                        onChange={(event) => setSelectedVariantId(event.target.value)}
                        aria-label="Selecionar variacao"
                        className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                      >
                        {selectedProduct.variants.map((variant) => (
                          <option key={variant.id} value={variant.id}>
                            {formatVariantLabel(variant)} {variant.stock <= 0 ? "• sem estoque" : ""}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                          Quantidade
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={draftQuantity}
                          onChange={(event) => setDraftQuantity(Math.max(1, Number(event.target.value) || 1))}
                          aria-label="Quantidade para adicionar"
                          className="mt-2 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                        />
                      </div>
                      <div className="rounded-lg bg-[var(--color-surface-1)] px-4 py-3 text-sm">
                        <p className="text-[var(--color-muted)]">Estoque disponivel</p>
                        <p className="mt-1 font-semibold text-[var(--color-text)]">{selectedVariant?.stock ?? 0}</p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg bg-[var(--color-surface-1)] px-4 py-3 text-sm">
                        <p className="text-[var(--color-muted)]">Preco unitario</p>
                        <p className="mt-1 font-semibold text-[var(--color-text)]">
                          {selectedVariant ? formatCents(selectedVariant.price_cents) : "-"}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[var(--color-surface-1)] px-4 py-3 text-sm">
                        <p className="text-[var(--color-muted)]">Subtotal do item</p>
                        <p className="mt-1 font-semibold text-[var(--color-text)]">
                          {selectedVariant ? formatCents(selectedVariant.price_cents * draftQuantity) : "-"}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleAddItem}
                      disabled={selectedVariant?.stock === 0}
                      className="w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
                    >
                      Adicionar item ao pedido
                    </button>
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Metodo de entrega
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Escolha envio com frete ou retirada sem frete calculado.
                </p>
              </div>
              <div className="inline-flex rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-1">
                <button
                  type="button"
                  onClick={() => handleChangeDeliveryMethod("shipping")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    deliveryMethod === "shipping"
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                      : "text-[var(--color-muted)]"
                  }`}
                >
                  Envio
                </button>
                <button
                  type="button"
                  onClick={() => handleChangeDeliveryMethod("pickup")}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${
                    deliveryMethod === "pickup"
                      ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                      : "text-[var(--color-muted)]"
                  }`}
                >
                  Retirada
                </button>
              </div>
            </div>

            {deliveryMethod === "shipping" ? (
              <div className="mt-5 space-y-4">
                <div className="flex flex-col gap-3 lg:flex-row">
                  <input
                    type="text"
                    placeholder="CEP do cliente"
                    value={cep}
                    onChange={(event) => handleCepChange(event.target.value)}
                    aria-label="CEP para frete"
                    className="flex-1 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-2 text-sm"
                  />
                  <button
                    type="button"
                    onClick={calculateShipping}
                    disabled={cart.length === 0 || cep.length !== 8 || isCalculatingShipping}
                    className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
                  >
                    {isCalculatingShipping ? "Calculando..." : "Calcular frete"}
                  </button>
                </div>

                {shippingMessage ? (
                  <p className="text-sm text-[var(--color-muted)]">{shippingMessage}</p>
                ) : null}

                {shippingOptions.length > 0 ? (
                  <div className="space-y-2">
                    {shippingOptions.map((option) => {
                      const isSelected = selectedShipping?.service_id === option.service_id;
                      return (
                        <label
                          key={option.service_id}
                          className={`flex cursor-pointer items-center justify-between rounded-xl border px-4 py-3 transition ${
                            isSelected
                              ? "border-[var(--color-accent)] bg-[var(--color-accent)]/5"
                              : "border-[var(--color-line)] bg-[var(--color-surface-1)]"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="radio"
                              name="shipping-option"
                              checked={isSelected}
                              onChange={() => setSelectedShipping(option)}
                            />
                            <div>
                              <p className="text-sm font-semibold text-[var(--color-text)]">{option.name}</p>
                              <p className="text-xs text-[var(--color-muted)]">
                                {option.delivery_days} dia(s) uteis
                              </p>
                            </div>
                          </div>
                          <span className="text-sm font-semibold text-[var(--color-text)]">
                            {formatCents(option.price_cents)}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-dashed border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-5 text-sm text-[var(--color-muted)]">
                Retirada selecionada. O pedido sera criado sem frete calculado.
              </div>
            )}
          </section>
        </div>

        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                  Resumo do pedido
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Revise cliente, itens e entrega antes de criar o pedido.
                </p>
              </div>
              <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--color-muted)]">
                {cart.length} item(ns)
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {cart.length === 0 ? (
                <p className="rounded-xl border border-dashed border-[var(--color-line)] px-4 py-5 text-sm text-[var(--color-muted)]">
                  Nenhum item adicionado ainda.
                </p>
              ) : (
                cart.map((item) => (
                  <div key={item.variant.id} className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">{item.product.title}</p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">{formatVariantLabel(item.variant)}</p>
                        <p className="mt-1 text-xs text-[var(--color-muted)]">Estoque: {item.variant.stock}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(item.variant.id)}
                        className="text-xs font-semibold text-rose-600 hover:underline"
                      >
                        Remover
                      </button>
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(item.variant.id, item.quantity - 1)}
                          className="h-8 w-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] text-sm font-semibold text-[var(--color-text)]"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(event) => updateItemQuantity(item.variant.id, Number(event.target.value) || 1)}
                          className="h-8 w-16 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-2 text-center text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => updateItemQuantity(item.variant.id, item.quantity + 1)}
                          className="h-8 w-8 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] text-sm font-semibold text-[var(--color-text)]"
                        >
                          +
                        </button>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-[var(--color-muted)]">
                          {formatCents(item.variant.price_cents)} cada
                        </p>
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {formatCents(item.variant.price_cents * item.quantity)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 rounded-xl bg-[var(--color-surface-1)] p-4 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-muted)]">Cliente</span>
                <span className="font-medium text-[var(--color-text)]">
                  {customerName.trim() || "Nao informado"}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">Entrega</span>
                <span className="font-medium text-[var(--color-text)]">
                  {formatDeliveryMethodLabel(deliveryMethod)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">Subtotal</span>
                <span className="font-medium text-[var(--color-text)]">{formatCents(subtotalCents)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-[var(--color-muted)]">Frete</span>
                <span className="font-medium text-[var(--color-text)]">
                  {deliveryMethod === "pickup"
                    ? "Nao se aplica"
                    : selectedShipping
                      ? formatCents(selectedShipping.price_cents)
                      : "Pendente"}
                </span>
              </div>
              <div className="mt-3 border-t border-[var(--color-line)] pt-3">
                <div className="flex items-center justify-between text-base font-semibold text-[var(--color-text)]">
                  <span>Total</span>
                  <span>{formatCents(totalCents)}</span>
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm">
              <p className="font-semibold text-[var(--color-text)]">Checklist</p>
              <p className={needsItems ? "text-amber-400" : "text-emerald-300"}>
                {needsItems ? "• Adicione itens ao pedido" : "• Itens prontos"}
              </p>
              <p className={needsCustomerName || needsCustomerContact ? "text-amber-400" : "text-emerald-300"}>
                {needsCustomerName || needsCustomerContact
                  ? "• Complete os dados do cliente"
                  : "• Cliente pronto"}
              </p>
              <p className={needsShippingSelection ? "text-amber-400" : "text-emerald-300"}>
                {deliveryMethod === "pickup"
                  ? "• Retirada nao exige frete"
                  : needsShippingSelection
                    ? "• Selecione um frete"
                    : "• Frete selecionado"}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCreateOrder}
              disabled={isCreatingOrder || !canCreateOrder}
              className="mt-5 w-full rounded-lg bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
            >
              {isCreatingOrder ? "Criando pedido..." : "Criar pedido"}
            </button>
          </section>

          {createdOrder ? (
            <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-300">
                Pedido criado
              </p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--color-text)]">
                Pedido {createdOrder.id.slice(0, 8)} criado com sucesso
              </h2>
              <div className="mt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
                <p><span className="font-medium">Origem:</span> Venda assistida</p>
                <p><span className="font-medium">Entrega:</span> {formatDeliveryMethodLabel(createdOrder.delivery_method)}</p>
                <p><span className="font-medium">Status:</span> {createdOrder.status}</p>
                <p><span className="font-medium">Total:</span> {formatCents(createdOrder.total_cents)}</p>
                <p>
                  <span className="font-medium">Pagamento:</span>{" "}
                  {createdOrder.latest_payment_status ?? "Nenhum pagamento iniciado"}
                </p>
              </div>

              <div className="mt-5 rounded-xl border border-emerald-200 bg-[var(--color-surface-1)] p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-[var(--color-text)]">Pagamento</p>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Gere manualmente um link de checkout para enviar ao cliente.
                    </p>
                  </div>
                  <span className="rounded-full bg-[var(--color-surface-2)] px-3 py-1 text-xs font-semibold text-[var(--color-text-secondary)]">
                    {paymentPreference ? "Link gerado" : isGeneratingPaymentLink ? "Gerando link" : "Pedido criado"}
                  </span>
                </div>

                {paymentLinkMessage ? (
                  <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-300">
                    {paymentLinkMessage}
                  </p>
                ) : null}

                {paymentLinkError ? (
                  <p className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {paymentLinkError}
                  </p>
                ) : null}

                {paymentPreference ? (
                  <div className="mt-4 space-y-3">
                    <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-3 py-3">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">
                        Link de pagamento
                      </p>
                      <p className="mt-2 break-all text-sm text-[var(--color-text)]">{paymentPreference.checkout_url}</p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button
                        type="button"
                        onClick={handleCopyPaymentLink}
                        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)]"
                      >
                        Copiar link
                      </button>
                      <a
                        href={paymentPreference.checkout_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text)]"
                      >
                        Abrir checkout
                      </a>
                      <Link
                        href={`/admin/orders/${createdOrder.id}`}
                        className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text)]"
                      >
                        Ver pedido
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handleGeneratePaymentLink}
                      disabled={isGeneratingPaymentLink}
                      className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] disabled:opacity-50"
                    >
                      {isGeneratingPaymentLink ? "Gerando link..." : "Gerar link de pagamento"}
                    </button>
                    <Link
                      href={`/admin/orders/${createdOrder.id}`}
                      className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text)]"
                    >
                      Ver pedido
                    </Link>
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={resetFlowForNewOrder}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text)]"
                >
                  Novo pedido
                </button>
              </div>
              <p className="mt-4 text-xs text-[var(--color-muted)]">
                Depois de gerar o link, acompanhe a evolucao do pedido na listagem normal em Pedidos.
              </p>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
