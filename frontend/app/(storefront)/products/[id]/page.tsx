"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AddedToCartToast } from "@/components/added-to-cart-toast";
import { useCart } from "@/components/cart-provider";
import { ProductImageCarousel } from "@/components/products/ProductImageCarousel";
import { PublicPanel } from "@/components/storefront/PublicShell";
import { EmptyState, ErrorState, LoadingState } from "@/components/storefront/StateBlocks";
import { ApiRequestError, getProductById, type Product } from "@/lib/api";
import { formatCents } from "@/lib/currency";

type ToastInfo = { productTitle: string; sku: string } | null;

function normalizeVariantAttributes(variant: Product["variants"][number]): Record<string, string> {
  const rawAttrs = (variant as Record<string, unknown>).attributes_json;
  if (typeof rawAttrs !== "object" || rawAttrs === null) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(rawAttrs as Record<string, unknown>)
      .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== "")
      .map(([key, value]) => [key, String(value)])
  );
}

function availabilityCopy(product: Product | null, variant: Product["variants"][number] | null): {
  label: string;
  description: string;
  tone: "success" | "warning" | "danger";
} {
  if (!product || product.variants.length === 0) {
    return {
      label: "Sem variantes disponiveis",
      description: "Este produto ainda nao possui uma opcao valida para compra.",
      tone: "danger",
    };
  }

  if (!variant) {
    return {
      label: "Selecione uma variante",
      description: "Escolha uma opcao para confirmar exatamente o que vai para o carrinho.",
      tone: "warning",
    };
  }

  if (variant.stock <= 0) {
    return {
      label: "Sem estoque no momento",
      description: "Esta variante existe no catalogo, mas esta indisponivel para compra agora.",
      tone: "danger",
    };
  }

  if (variant.stock <= 3) {
    return {
      label: "Estoque baixo",
      description: `Restam ${variant.stock} unidade(s) desta variante.`,
      tone: "warning",
    };
  }

  return {
    label: "Disponivel para compra",
    description: `${variant.stock} unidade(s) prontas para seguir ao carrinho.`,
    tone: "success",
  };
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastInfo>(null);
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function run() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getProductById(productId);
        if (isActive) {
          setProduct(data);
          const firstAvailableVariant = data.variants.find((variant) => variant.stock > 0) ?? data.variants[0] ?? null;
          setSelectedVariantId(firstAvailableVariant?.id ?? null);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : "Falha inesperada ao carregar o produto.";
        if (isActive) {
          setErrorMessage(message);
          setProduct(null);
          setSelectedVariantId(null);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    run();

    return () => {
      isActive = false;
    };
  }, [productId]);

  const hasVariants = useMemo(() => (product?.variants.length ?? 0) > 0, [product]);
  const selectedVariant = useMemo(
    () => product?.variants.find((variant) => variant.id === selectedVariantId) ?? null,
    [product, selectedVariantId]
  );
  const selectedVariantAttributes = useMemo(
    () => (selectedVariant ? normalizeVariantAttributes(selectedVariant) : {}),
    [selectedVariant]
  );
  const availability = useMemo(
    () => availabilityCopy(product, selectedVariant),
    [product, selectedVariant]
  );
  const canAddSelectedVariant = selectedVariant !== null && selectedVariant.stock > 0;

  const handleAddVariant = useCallback(
    (variant: Product["variants"][number]) => {
      const attributes = normalizeVariantAttributes(variant);

      addItem({
        productId: product!.id,
        productTitle: product!.title,
        variantId: variant.id,
        sku: variant.sku,
        unitPriceCents: variant.price_cents,
        ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
      });

      setToast({ productTitle: product!.title, sku: variant.sku });
    },
    [addItem, product],
  );

  return (
    <div className="space-y-6">
      {toast ? (
        <AddedToCartToast
          productTitle={toast.productTitle}
          sku={toast.sku}
          onClose={() => setToast(null)}
        />
      ) : null}

      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--color-text-secondary)]">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
        >
          <span aria-hidden="true">←</span>
          Voltar ao catalogo
        </Link>
        <span className="rounded-full border border-[var(--color-line)] px-3 py-2 text-xs uppercase tracking-[0.18em]">
          Detalhe do produto
        </span>
      </div>

      {errorMessage ? (
        <ErrorState
          title="Nao foi possivel carregar o produto"
          message={errorMessage}
          action={
            <Link
              href="/"
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)]"
            >
              Voltar ao catalogo
            </Link>
          }
        />
      ) : null}

      {isLoading ? (
        <LoadingState
          title="Carregando produto"
          message="Buscando fotos, variantes e disponibilidade para montar a pagina de compra."
        />
      ) : null}

      {product ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:items-start">
          <div className="space-y-4">
            <ProductImageCarousel images={product.images} />
            <PublicPanel>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
                  {product.images.length > 0 ? `${product.images.length} foto(s)` : "Sem fotos"}
                </span>
                <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
                  {product.variants.length} {product.variants.length === 1 ? "variante" : "variantes"}
                </span>
              </div>
            </PublicPanel>
          </div>

          <div className="space-y-5 rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(16,26,47,0.96),rgba(10,18,33,0.96))] p-6 shadow-[0_20px_54px_rgba(0,0,0,0.24)]">
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
                  Produto
                </p>
                <h1 className="font-display text-4xl font-semibold leading-[0.98] text-[var(--color-text-primary)]">
                  {product.title}
                </h1>
                <p className="max-w-2xl text-sm leading-6 text-[var(--color-text-secondary)]">
                  {product.description ?? "Camiseta pronta para compra online, com detalhes claros de variante, estoque e valor final."}
                </p>
              </div>

              <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)]/88 p-5">
                <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
                  Preco da variante selecionada
                </p>
                <p className="mt-2 font-display text-4xl font-semibold text-[var(--color-text-primary)]">
                  {selectedVariant ? formatCents(selectedVariant.price_cents) : "--"}
                </p>
                <div
                  className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${
                    availability.tone === "success"
                      ? "border-[var(--color-success-text)]/18 bg-[var(--color-success-bg)] text-[var(--color-success-text)]"
                      : availability.tone === "warning"
                        ? "border-[var(--color-warning-text)]/18 bg-[var(--color-warning-bg)] text-[var(--color-warning-text)]"
                        : "border-[var(--color-danger-text)]/20 bg-[var(--color-danger-bg)] text-[var(--color-danger-text)]"
                  }`}
                >
                  <p className="font-semibold">{availability.label}</p>
                  <p className="mt-1 text-xs leading-5 opacity-90">{availability.description}</p>
                </div>
              </div>
            </div>

            {hasVariants ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
                    Escolha a variante
                  </h2>
                  <span className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                    {product.variants.length} opcao(oes)
                  </span>
                </div>
                <div className="space-y-3">
                  {product.variants.map((variant) => {
                    const attrEntries = Object.entries(normalizeVariantAttributes(variant));
                    const isSelected = selectedVariant?.id === variant.id;
                    const isOutOfStock = variant.stock <= 0;

                    return (
                      <button
                        key={variant.id}
                        type="button"
                        onClick={() => setSelectedVariantId(variant.id)}
                        className={`w-full rounded-[22px] border p-4 text-left transition ${
                          isSelected
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_14px_32px_rgba(0,0,0,0.2)]"
                            : "border-[var(--color-line)] bg-[var(--color-surface-1)]/88 hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-2)]"
                        }`}
                        aria-pressed={isSelected}
                      >
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div className="space-y-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-[var(--color-text-primary)]">{variant.sku}</p>
                              {isSelected ? (
                                <span className="rounded-full border border-[var(--color-accent)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
                                  Selecionada
                                </span>
                              ) : null}
                              {isOutOfStock ? (
                                <span className="rounded-full border border-[var(--color-danger-text)]/25 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-danger-text)]">
                                  Sem estoque
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-[var(--color-text-secondary)]">
                              {variant.stock > 0 ? `${variant.stock} unidade(s) disponiveis` : "Indisponivel agora"}
                            </p>
                            {attrEntries.length > 0 ? (
                              <div className="flex flex-wrap gap-2">
                                {attrEntries.map(([key, value]) => (
                                  <span
                                    key={`${variant.id}-${key}`}
                                    className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11px] text-[var(--color-text-secondary)]"
                                  >
                                    {key}: {value}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-[var(--color-text-muted)]">Sem atributos adicionais.</p>
                            )}
                          </div>
                          <div className="text-left sm:text-right">
                            <p className="font-display text-2xl font-semibold text-[var(--color-text-primary)]">
                              {formatCents(variant.price_cents)}
                            </p>
                            <p className="mt-1 text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                              Clique para escolher
                            </p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Sem variantes para compra"
                message="Este produto ainda nao possui uma opcao pronta para ser adicionada ao carrinho."
              />
            )}

            <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)]/88 p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
                    Opcao que vai para o carrinho
                  </p>
                  {selectedVariant ? (
                    <>
                      <p className="mt-2 text-lg font-semibold text-[var(--color-text-primary)]">
                        {selectedVariant.sku}
                      </p>
                      <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                        {Object.keys(selectedVariantAttributes).length > 0
                          ? Object.entries(selectedVariantAttributes)
                              .map(([key, value]) => `${key}: ${value}`)
                              .join(" · ")
                          : "Sem atributos adicionais para esta variante."}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
                      Nenhuma variante selecionada.
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedVariant) {
                      handleAddVariant(selectedVariant);
                    }
                  }}
                  disabled={!canAddSelectedVariant}
                  className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent)] px-5 py-3 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {!hasVariants
                    ? "Sem variantes"
                    : selectedVariant === null
                      ? "Selecione uma variante"
                      : selectedVariant.stock <= 0
                        ? "Sem estoque"
                        : "Adicionar ao carrinho"}
                </button>
              </div>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
