"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";

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

type AddressForm = {
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
};

type ViaCepResult = {
  logradouro: string;
  bairro: string;
  localidade: string;
  uf: string;
  erro?: boolean;
};

type SubmissionStage =
  | "idle"
  | "creating_order"
  | "creating_payment"
  | "redirecting"
  | "pix_ready";

const PUBLIC_APP_BASE_URL = process.env.NEXT_PUBLIC_APP_BASE_URL?.trim() ?? "";

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return "Falha inesperada ao processar o checkout.";
}

function resolveCheckoutResultBaseUrl(): string | undefined {
  const configuredBaseUrl = PUBLIC_APP_BASE_URL.replace(/\/$/, "");
  if (configuredBaseUrl !== "") {
    return `${configuredBaseUrl}/checkout/result`;
  }
  if (typeof window === "undefined") {
    return undefined;
  }
  return `${window.location.origin}/checkout/result`;
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

async function fetchViaCep(cep: string): Promise<ViaCepResult | null> {
  if (cep.length !== 8) return null;
  try {
    const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    if (!res.ok) return null;
    const data = (await res.json()) as ViaCepResult;
    if (data.erro) return null;
    return data;
  } catch {
    return null;
  }
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, deliveryMethod, totalCents, selectedShipping, destinationPostalCode } = useCart();

  const [form, setForm] = useState<CheckoutForm>({
    customerName: "",
    customerEmail: "",
    customerPhone: "",
  });
  const [paymentMethod, setPaymentMethod] = useState<"checkout_pro" | "pix">("checkout_pro");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionStage, setSubmissionStage] = useState<SubmissionStage>("idle");
  const [order, setOrder] = useState<OrderRead | null>(null);
  const [paymentPreference, setPaymentPreference] = useState<MercadoPagoPreferenceResponse | null>(null);
  const [pixPayment, setPixPayment] = useState<MercadoPagoPixPaymentResponse | null>(null);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [isRedirectingToCart, setIsRedirectingToCart] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);
  const [paymentError, setPaymentError] = useState<string | null>(null);

  const isPickup = deliveryMethod === "pickup";
  const [address, setAddress] = useState<AddressForm>({
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [isFetchingAddress, setIsFetchingAddress] = useState(false);
  const [addressFetchedForCep, setAddressFetchedForCep] = useState<string | null>(null);

  const shippingCents = selectedShipping?.priceCents ?? 0;
  const totalWithShippingCents = totalCents + shippingCents;
  const destinationPostalCodeDigits = destinationPostalCode ?? "";

  // Auto-busca ViaCEP quando CEP muda e delivery é shipping
  useEffect(() => {
    if (isPickup || destinationPostalCodeDigits.length !== 8) return;
    if (addressFetchedForCep === destinationPostalCodeDigits) return;

    setIsFetchingAddress(true);
    fetchViaCep(destinationPostalCodeDigits).then((result) => {
      if (result) {
        setAddress((prev) => ({
          ...prev,
          street: result.logradouro || prev.street,
          neighborhood: result.bairro || prev.neighborhood,
          city: result.localidade || prev.city,
          state: result.uf || prev.state,
        }));
      }
      setAddressFetchedForCep(destinationPostalCodeDigits);
      setIsFetchingAddress(false);
    });
  }, [destinationPostalCodeDigits, isPickup, addressFetchedForCep]);

  useEffect(() => {
    // Para envio: precisa de frete selecionado. Para retirada: só precisa de itens.
    const needsRedirect = items.length === 0 || (!isPickup && selectedShipping === null);
    if (!needsRedirect) {
      setIsRedirectingToCart(false);
      return;
    }
    setIsRedirectingToCart(true);
    router.replace("/cart");
  }, [items.length, isPickup, router, selectedShipping]);

  const addressIsValid = useMemo(
    () =>
      isPickup ||
      (address.street.trim() !== "" &&
        address.number.trim() !== "" &&
        address.city.trim() !== "" &&
        address.state.trim().length === 2),
    [isPickup, address.street, address.number, address.city, address.state],
  );

  const canSubmit = useMemo(
    () =>
      items.length > 0 &&
      !isSubmitting &&
      !isRedirectingToCart &&
      (isPickup || (selectedShipping !== null && destinationPostalCodeDigits.length === 8)) &&
      addressIsValid &&
      (paymentMethod === "checkout_pro" || paymentMethod === "pix"),
    [addressIsValid, destinationPostalCodeDigits.length, isPickup, isRedirectingToCart, isSubmitting, items.length, paymentMethod, selectedShipping],
  );

  const submissionCallout = useMemo(() => {
    if (submissionStage === "creating_order") {
      return {
        tone: "neutral" as const,
        title: "Criando pedido",
        message: "Registrando itens, cliente e frete antes de iniciar o pagamento.",
      };
    }
    if (submissionStage === "creating_payment") {
      return {
        tone: "neutral" as const,
        title: "Iniciando pagamento",
        message:
          paymentMethod === "checkout_pro"
            ? "Gerando a preferencia do Mercado Pago para abrir o checkout."
            : "Gerando os dados do PIX para concluir o pagamento.",
      };
    }
    if (submissionStage === "redirecting") {
      return {
        tone: "success" as const,
        title: "Redirecionando para o Mercado Pago",
        message: "A pagina de pagamento esta sendo aberta nesta aba. Se nao carregar, use o link manual abaixo.",
      };
    }
    if (submissionStage === "pix_ready") {
      return {
        tone: "success" as const,
        title: "Pedido criado e PIX pronto",
        message: "Os dados do pagamento ja foram gerados. Use o QR Code ou o codigo copia e cola para concluir.",
      };
    }
    return null;
  }, [paymentMethod, submissionStage]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) {
      return;
    }

    setIsSubmitting(true);
    setSubmissionStage("creating_order");
    setOrderError(null);
    setPaymentError(null);
    setOrder(null);
    setPaymentPreference(null);
    setPixPayment(null);
    setIsRedirecting(false);

    if (!isPickup && (!selectedShipping || destinationPostalCodeDigits.length !== 8)) {
      setOrderError("Selecione um frete valido no carrinho antes de continuar.");
      setSubmissionStage("idle");
      setIsSubmitting(false);
      return;
    }

    try {
      const createdOrder = await createOrder({
        delivery_method: isPickup ? "pickup" : "shipping",
        customer_name: form.customerName || undefined,
        customer_email: form.customerEmail || undefined,
        customer_phone: form.customerPhone ? `+55${form.customerPhone.replace(/\D/g, "")}` : undefined,
        items: items.map((item) => ({
          variant_id: item.variantId,
          quantity: item.quantity,
        })),
        ...(!isPickup && selectedShipping
          ? {
              shipping: {
                provider: "melhor_envio" as const,
                service_id: selectedShipping.serviceId,
                service_name: selectedShipping.serviceName,
                delivery_days: selectedShipping.deliveryDays,
                price_cents: selectedShipping.priceCents,
                to_postal_code: destinationPostalCodeDigits,
                quote_json: (selectedShipping.quoteRaw as Record<string, unknown> | undefined) ?? null,
                address_street: address.street.trim() || undefined,
                address_number: address.number.trim() || undefined,
                address_complement: address.complement.trim() || undefined,
                address_neighborhood: address.neighborhood.trim() || undefined,
                address_city: address.city.trim() || undefined,
                address_state: address.state.trim() || undefined,
              },
            }
          : {}),
      });

      setOrder(createdOrder);
      setSubmissionStage("creating_payment");

      try {
        if (paymentMethod === "checkout_pro") {
          const returnUrlBase = resolveCheckoutResultBaseUrl();
          const preferenceResponse = await createMercadoPagoPreference(createdOrder.id, returnUrlBase);
          setPaymentPreference(preferenceResponse);
          setIsRedirecting(true);
          setSubmissionStage("redirecting");
          window.setTimeout(() => {
            window.location.assign(preferenceResponse.checkout_url);
          }, 150);
        } else {
          const pixResponse = await createMercadoPagoPayment(createdOrder.id);
          setPixPayment(pixResponse);
          setSubmissionStage("pix_ready");
        }
      } catch (error) {
        setPaymentError(messageFromError(error));
        setSubmissionStage("idle");
      }
    } catch (error) {
      setOrderError(messageFromError(error));
      setSubmissionStage("idle");
    } finally {
      setIsSubmitting(false);
    }
  }

  const submitLabel =
    submissionStage === "creating_order"
      ? "Criando pedido..."
      : submissionStage === "creating_payment"
        ? paymentMethod === "checkout_pro"
          ? "Iniciando pagamento..."
          : "Gerando PIX..."
        : paymentMethod === "checkout_pro"
          ? "Criar pedido e ir para o Mercado Pago"
          : "Criar pedido com PIX";

  return (
    <div className="space-y-8">
      <PublicHero
        eyebrow="Checkout"
        title="Feche o pedido com dados claros, resumo confiavel e proxima acao explicita."
        description="A jornada de fechamento agora reforca cliente, frete, pagamento e total final sem cara de tela operacional crua."
        actions={
          <>
            <Link
              href="/cart"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
            >
              Voltar ao carrinho
            </Link>
            <div className="inline-flex items-center justify-center rounded-xl border border-[var(--color-line)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-secondary)]">
              Total atual {formatCents(totalWithShippingCents)}
            </div>
          </>
        }
      />

      {items.length === 0 && !order ? (
        <EmptyState
          title="Seu carrinho esta vazio"
          message="Nao ha itens prontos para gerar um pedido. Volte ao catalogo ou retorne ao carrinho para revisar a compra."
          action={
            <Link
              href="/"
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
            >
              Ir para a loja
            </Link>
          }
        />
      ) : null}

      {items.length > 0 && selectedShipping === null && !isPickup && !order ? (
        <StatusCallout
          tone="warning"
          title={isRedirectingToCart ? "Voltando ao carrinho" : "Frete obrigatorio antes do checkout"}
          message={
            isRedirectingToCart
              ? "O checkout depende de uma opcao de frete selecionada. Estamos retornando voce ao carrinho."
              : "Selecione um frete no carrinho antes de preencher os dados do cliente e iniciar o pagamento."
          }
          action={
            <Link
              href="/cart"
              className="inline-flex rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)]"
            >
              Voltar ao carrinho
            </Link>
          }
        />
      ) : null}

      {submissionCallout ? (
        <StatusCallout
          tone={submissionCallout.tone}
          title={submissionCallout.title}
          message={submissionCallout.message}
        />
      ) : null}

      {orderError ? (
        <StatusCallout tone="danger" title="Falha ao criar pedido" message={orderError} />
      ) : null}

      {paymentError ? (
        <StatusCallout tone="danger" title="Falha ao iniciar pagamento" message={paymentError} />
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_360px] lg:items-start">
        <div className="order-2 space-y-6 lg:order-1">
          <form onSubmit={handleSubmit} className="space-y-6">
            <PurchaseSectionCard
              eyebrow="Cliente"
              title="Dados para identificar o pedido"
              description="Preencha os dados principais do comprador antes de seguir para o pagamento."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-sm font-semibold text-[var(--color-text-primary)] md:col-span-2" htmlFor="customerName">
                  Nome
                  <input
                    id="customerName"
                    className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                    value={form.customerName}
                    onChange={(event) => setForm((current) => ({ ...current, customerName: event.target.value }))}
                    placeholder="Como esse cliente deve aparecer no pedido"
                  />
                </label>

                <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="customerEmail">
                  Email
                  <input
                    id="customerEmail"
                    type="email"
                    required
                    className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                    value={form.customerEmail}
                    onChange={(event) => setForm((current) => ({ ...current, customerEmail: event.target.value }))}
                    placeholder="cliente@email.com"
                  />
                </label>

                <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="customerPhone">
                  Telefone
                  <div className="mt-2 flex overflow-hidden rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)]">
                    <span className="flex items-center border-r border-[var(--color-line)] px-4 text-sm text-[var(--color-text-secondary)]">
                      +55
                    </span>
                    <input
                      id="customerPhone"
                      className="flex-1 bg-transparent px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none"
                      value={form.customerPhone}
                      onChange={(event) => setForm((current) => ({ ...current, customerPhone: event.target.value }))}
                      placeholder="11 99999-9999"
                      type="tel"
                    />
                  </div>
                </label>
              </div>
            </PurchaseSectionCard>

            {/* Seção de endereço — só para envio */}
            {!isPickup ? (
              <PurchaseSectionCard
                eyebrow="Endereço de entrega"
                title="Para onde vamos enviar?"
                description={
                  isFetchingAddress
                    ? "Buscando endereço pelo CEP..."
                    : "Preencha o endereço completo. O logradouro e cidade são preenchidos automaticamente pelo CEP."
                }
              >
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="addrStreet">
                      Logradouro (rua, avenida…) *
                      <input
                        id="addrStreet"
                        required
                        className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                        value={address.street}
                        onChange={(e) => setAddress((prev) => ({ ...prev, street: e.target.value }))}
                        placeholder="Rua das Flores"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="addrNumber">
                      Número *
                      <input
                        id="addrNumber"
                        required
                        className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                        value={address.number}
                        onChange={(e) => setAddress((prev) => ({ ...prev, number: e.target.value }))}
                        placeholder="123"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="addrComplement">
                      Complemento
                      <input
                        id="addrComplement"
                        className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                        value={address.complement}
                        onChange={(e) => setAddress((prev) => ({ ...prev, complement: e.target.value }))}
                        placeholder="Apto 2, Bloco B…"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="addrNeighborhood">
                      Bairro
                      <input
                        id="addrNeighborhood"
                        className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                        value={address.neighborhood}
                        onChange={(e) => setAddress((prev) => ({ ...prev, neighborhood: e.target.value }))}
                        placeholder="Centro"
                      />
                    </label>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_80px]">
                    <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="addrCity">
                      Cidade *
                      <input
                        id="addrCity"
                        required
                        className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)]"
                        value={address.city}
                        onChange={(e) => setAddress((prev) => ({ ...prev, city: e.target.value }))}
                        placeholder="São Paulo"
                      />
                    </label>
                    <label className="block text-sm font-semibold text-[var(--color-text-primary)]" htmlFor="addrState">
                      UF *
                      <input
                        id="addrState"
                        required
                        maxLength={2}
                        className="mt-2 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-3)] px-4 py-3 text-sm text-[var(--color-text-primary)] outline-none transition focus:border-[var(--color-line-strong)] uppercase"
                        value={address.state}
                        onChange={(e) => setAddress((prev) => ({ ...prev, state: e.target.value.toUpperCase().slice(0, 2) }))}
                        placeholder="SP"
                      />
                    </label>
                  </div>

                  <div className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-xs text-[var(--color-text-muted)]">
                    CEP: <span className="font-semibold text-[var(--color-text-secondary)]">{formatPostalCode(destinationPostalCodeDigits)}</span>
                    {" · "}Campos com * são obrigatórios
                  </div>
                </div>
              </PurchaseSectionCard>
            ) : (
              <PurchaseSectionCard
                eyebrow="Retirada"
                title="Pedido para retirada no local"
                description="Nenhum endereço de entrega necessário. Combinaremos o ponto de retirada após a confirmação do pedido."
              >
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  O endereço e horário de retirada serão informados pelo vendedor após o pagamento confirmado.
                </div>
              </PurchaseSectionCard>
            )}

            <PurchaseSectionCard
              eyebrow="Pagamento"
              title="Escolha como concluir a compra"
              description="O pedido so fica concluido depois que o Mercado Pago confirma o pagamento."
            >
              <fieldset className="space-y-3">
                <legend className="sr-only">Forma de pagamento</legend>
                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-[22px] border px-4 py-4 transition ${
                    paymentMethod === "checkout_pro"
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-line)] bg-[var(--color-surface-1)]/88 hover:border-[var(--color-line-strong)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="checkout_pro"
                    checked={paymentMethod === "checkout_pro"}
                    onChange={() => setPaymentMethod("checkout_pro")}
                    className="mt-1"
                  />
                  <span className="space-y-1">
                    <span className="block font-semibold text-[var(--color-text-primary)]">Checkout Pro do Mercado Pago</span>
                    <span className="block text-sm leading-6 text-[var(--color-text-secondary)]">
                      Ideal para redirecionar o cliente e concluir o pagamento no ambiente do Mercado Pago.
                    </span>
                  </span>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-3 rounded-[22px] border px-4 py-4 transition ${
                    paymentMethod === "pix"
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                      : "border-[var(--color-line)] bg-[var(--color-surface-1)]/88 hover:border-[var(--color-line-strong)]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="pix"
                    checked={paymentMethod === "pix"}
                    onChange={() => setPaymentMethod("pix")}
                    className="mt-1"
                  />
                  <span className="space-y-1">
                    <span className="block font-semibold text-[var(--color-text-primary)]">PIX via Mercado Pago</span>
                    <span className="block text-sm leading-6 text-[var(--color-text-secondary)]">
                      Gera QR Code e codigo copia e cola para o cliente pagar sem sair da jornada da loja.
                    </span>
                  </span>
                </label>
              </fieldset>

              <div className="mt-5 rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                <p className="font-semibold text-[var(--color-text-primary)]">O que acontece depois do clique</p>
                <p className="mt-2 leading-6">
                  Primeiro criamos o pedido com frete e itens. Depois iniciamos o pagamento no Mercado Pago e mostramos
                  o estado final no retorno do checkout.
                </p>
              </div>

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-5 inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {submitLabel}
              </button>
            </PurchaseSectionCard>
          </form>

          {order ? (
            <PurchaseSectionCard
              eyebrow="Pedido"
              title="Pedido criado com sucesso"
              description="O pedido foi registrado. Agora falta concluir o pagamento ou aguardar a confirmacao."
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Pedido</p>
                  <p className="mt-2 font-mono text-sm text-[var(--color-text-primary)]">{order.id}</p>
                  <p className="mt-2">
                    Status: <span className="font-semibold text-[var(--color-text-primary)]">{order.status}</span>
                  </p>
                  <p>
                    Total: <span className="font-semibold text-[var(--color-text-primary)]">{formatCents(order.total_cents)}</span>
                  </p>
                </div>

                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Prazo</p>
                  {order.expires_at ? (
                    <p className="mt-2 leading-6">
                      Pagamento ate{" "}
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {new Date(order.expires_at).toLocaleString("pt-BR")}
                      </span>
                    </p>
                  ) : (
                    <p className="mt-2">O pedido nao informou prazo de expiracao.</p>
                  )}
                </div>
              </div>
            </PurchaseSectionCard>
          ) : null}

          {paymentPreference ? (
            <PurchaseSectionCard
              eyebrow="Checkout Pro"
              title="Redirecionando para o Mercado Pago"
              description="Se a nova aba ou pagina nao abrir automaticamente, use o link manual abaixo."
            >
              <div className="space-y-4">
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p>
                    ID da preferencia:{" "}
                    <span className="break-all font-semibold text-[var(--color-text-primary)]">
                      {paymentPreference.preference_id}
                    </span>
                  </p>
                  <p className="mt-2 leading-6">
                    {paymentPreference.is_sandbox
                      ? "O checkout sandbox do Mercado Pago esta sendo aberto nesta aba."
                      : isRedirecting
                        ? "Abrindo o Checkout Pro do Mercado Pago nesta aba."
                        : "Use o link abaixo para continuar o pagamento manualmente."}
                  </p>
                </div>

                <a
                  href={paymentPreference.checkout_url}
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
                >
                  Abrir Mercado Pago agora
                </a>

                <p className="break-all text-xs text-[var(--color-text-muted)]">
                  {paymentPreference.checkout_url}
                </p>
              </div>
            </PurchaseSectionCard>
          ) : null}

          {pixPayment ? (
            <PurchaseSectionCard
              eyebrow="PIX"
              title="Dados do pagamento gerados"
              description="Use o QR Code ou o codigo copia e cola para concluir o pagamento e depois acompanhe o retorno do pedido."
            >
              <div className="space-y-4">
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                  <p>
                    ID do pagamento:{" "}
                    <span className="break-all font-semibold text-[var(--color-text-primary)]">{pixPayment.payment_id}</span>
                  </p>
                  <p className="mt-1">
                    Status: <span className="font-semibold text-[var(--color-text-primary)]">{pixPayment.status}</span>
                  </p>
                  {pixPayment.external_reference ? (
                    <p className="mt-1">
                      Pedido:{" "}
                      <span className="break-all font-semibold text-[var(--color-text-primary)]">
                        {pixPayment.external_reference}
                      </span>
                    </p>
                  ) : null}
                </div>

                {pixPayment.qr_code ? (
                  <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">Codigo copia e cola</p>
                    <code className="mt-3 block break-all rounded-2xl bg-[var(--color-surface-3)] p-3 text-xs text-[var(--color-text-secondary)]">
                      {pixPayment.qr_code}
                    </code>
                  </div>
                ) : null}

                {pixPayment.qr_code_base64 ? (
                  <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                    <p className="text-sm font-semibold text-[var(--color-text-primary)]">QR Code do PIX</p>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/png;base64,${pixPayment.qr_code_base64}`}
                      alt="QR Code do PIX"
                      className="mt-4 max-w-[220px] rounded-2xl border border-[var(--color-line)] bg-white p-2"
                    />
                  </div>
                ) : null}

                {pixPayment.ticket_url ? (
                  <a
                    href={pixPayment.ticket_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex w-full items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-3 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)]"
                  >
                    Abrir boleto ou link de pagamento
                  </a>
                ) : null}
              </div>
            </PurchaseSectionCard>
          ) : null}
        </div>

        <div className="order-1 space-y-4 lg:order-2 lg:sticky lg:top-24">
          <PurchaseSummaryCard
            eyebrow="Resumo"
            title="Pedido que sera enviado"
            description="Itens, frete e total final reunidos no mesmo bloco para reduzir incerteza antes do pagamento."
          >
            <div className="space-y-4">
              <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <ul className="space-y-3">
                  {items.map((item) => (
                    <li key={item.variantId} className="flex items-start justify-between gap-4 text-sm">
                      <span className="min-w-0">
                        <span className="block font-semibold text-[var(--color-text-primary)]">{item.productTitle}</span>
                        <span className="mt-1 block text-[var(--color-text-secondary)]">
                          {item.sku} · {item.quantity} un.
                        </span>
                      </span>
                      <span className="font-semibold text-[var(--color-text-primary)]">
                        {formatCents(item.quantity * item.unitPriceCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4 text-sm text-[var(--color-text-secondary)]">
                <p className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-text-muted)]">Entrega</p>
                {isPickup ? (
                  <p className="mt-2 font-semibold text-[var(--color-text-primary)]">Retirada no local</p>
                ) : selectedShipping ? (
                  <>
                    <p className="mt-2 font-semibold text-[var(--color-text-primary)]">{selectedShipping.serviceName}</p>
                    <p className="mt-1 leading-6">
                      {selectedShipping.deliveryDays} dia(s) · CEP {formatPostalCode(destinationPostalCodeDigits)}
                    </p>
                    {address.street ? (
                      <p className="mt-1 leading-6 text-xs">
                        {address.street}, {address.number}{address.complement ? `, ${address.complement}` : ""} — {address.city}/{address.state}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2">Nenhum frete selecionado.</p>
                )}
              </div>

              <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
                <dl className="space-y-3">
                  <SummaryRow label="Subtotal" value={formatCents(totalCents)} />
                  <SummaryRow label="Frete" value={isPickup ? "Retirada (grátis)" : formatCents(shippingCents)} />
                  <div className="border-t border-[var(--color-line)] pt-3">
                    <SummaryRow label="Total" value={formatCents(totalWithShippingCents)} strong />
                  </div>
                </dl>
              </div>

              <StatusCallout
                tone="neutral"
                title="Pagamento com retorno claro"
                message="Depois do Mercado Pago, a aplicacao sincroniza o pedido e mostra o estado final do pagamento sem esconder erro ou pendencia."
              />
            </div>
          </PurchaseSummaryCard>
        </div>
      </section>
    </div>
  );
}
