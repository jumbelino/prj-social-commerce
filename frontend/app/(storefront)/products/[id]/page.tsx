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

// Retorna as dimensões únicas presentes entre todas as variantes, ex: ["tamanho", "cor"]
function extractDimensions(variants: Product["variants"]): string[] {
  const dims = new Set<string>();
  for (const v of variants) {
    for (const key of Object.keys(normalizeVariantAttributes(v))) {
      dims.add(key);
    }
  }
  // tamanho/size primeiro, cor/color depois, restantes em ordem
  const priority = ["tamanho", "size", "cor", "color", "modelo", "modelo"];
  return [
    ...priority.filter((k) => dims.has(k)),
    ...[...dims].filter((k) => !priority.includes(k)),
  ];
}

// Retorna valores únicos de uma dimensão entre todas as variantes
function valuesForDimension(variants: Product["variants"], dim: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const v of variants) {
    const val = normalizeVariantAttributes(v)[dim];
    if (val && !seen.has(val)) {
      seen.add(val);
      result.push(val);
    }
  }
  return result;
}

// Dado um conjunto de seleções, encontra a variante que satisfaz todas elas
function findVariantForSelection(
  variants: Product["variants"],
  selection: Record<string, string>,
  dimensions: string[]
): Product["variants"][number] | null {
  if (dimensions.length === 0) return null;
  const entries = Object.entries(selection);
  if (entries.length !== dimensions.length) return null;

  return (
    variants.find((v) => {
      const attrs = normalizeVariantAttributes(v);
      return entries.every(([key, value]) => attrs[key] === value);
    }) ?? null
  );
}

// Verifica se uma combinação parcial tem alguma variante com estoque
function hasAnyStockForPartial(
  variants: Product["variants"],
  partial: Record<string, string>
): boolean {
  const entries = Object.entries(partial);
  return variants.some((v) => {
    const attrs = normalizeVariantAttributes(v);
    return entries.every(([key, value]) => attrs[key] === value) && v.stock > 0;
  });
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastInfo>(null);
  // seleção por dimensão, ex: { tamanho: "M", cor: "Preta" }
  const [selectedDimensions, setSelectedDimensions] = useState<Record<string, string>>({});

  useEffect(() => {
    let isActive = true;

    async function run() {
      setIsLoading(true);
      setErrorMessage(null);
      setSelectedDimensions({});

      try {
        const data = await getProductById(productId);
        if (isActive) {
          setProduct(data);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : "Falha inesperada ao carregar o produto.";
        if (isActive) {
          setErrorMessage(message);
          setProduct(null);
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

  const dimensions = useMemo(() => (product ? extractDimensions(product.variants) : []), [product]);
  const hasDimensions = dimensions.length > 0;

  // variante resolvida quando todas as dimensões foram selecionadas
  const selectedVariant = useMemo(() => {
    if (!product || !hasDimensions) return null;
    return findVariantForSelection(product.variants, selectedDimensions, dimensions);
  }, [product, selectedDimensions, dimensions, hasDimensions]);

  const allDimensionsSelected = hasDimensions && dimensions.every((d) => d in selectedDimensions);
  const canAddToCart = allDimensionsSelected && selectedVariant !== null && selectedVariant.stock > 0;

  const handleSelectDimension = useCallback((dim: string, value: string) => {
    setSelectedDimensions((prev) => ({ ...prev, [dim]: value }));
  }, []);

  const handleAddToCart = useCallback(() => {
    if (!product || !selectedVariant) return;
    const attributes = normalizeVariantAttributes(selectedVariant);

    addItem({
      productId: product.id,
      productTitle: product.title,
      variantId: selectedVariant.id,
      sku: selectedVariant.sku,
      unitPriceCents: selectedVariant.price_cents,
      ...(Object.keys(attributes).length > 0 ? { attributes } : {}),
    });

    setToast({ productTitle: product.title, sku: selectedVariant.sku });
  }, [addItem, product, selectedVariant]);

  // fallback: variantes sem atributos — usa seleção por card como antes
  const useFallbackCardSelector = product !== null && product.variants.length > 0 && !hasDimensions;
  const [fallbackSelectedId, setFallbackSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (useFallbackCardSelector && product) {
      const first = product.variants.find((v) => v.stock > 0) ?? product.variants[0] ?? null;
      setFallbackSelectedId(first?.id ?? null);
    }
  }, [useFallbackCardSelector, product]);

  const fallbackVariant = useMemo(
    () => product?.variants.find((v) => v.id === fallbackSelectedId) ?? null,
    [product, fallbackSelectedId]
  );

  const handleAddFallback = useCallback(() => {
    if (!product || !fallbackVariant) return;
    addItem({
      productId: product.id,
      productTitle: product.title,
      variantId: fallbackVariant.id,
      sku: fallbackVariant.sku,
      unitPriceCents: fallbackVariant.price_cents,
    });
    setToast({ productTitle: product.title, sku: fallbackVariant.sku });
  }, [addItem, product, fallbackVariant]);

  // preço e status da variante resolvida (ou fallback)
  const resolvedVariant = hasDimensions ? selectedVariant : fallbackVariant;
  const resolvedPrice = resolvedVariant?.price_cents ?? null;

  // preço a exibir: variante selecionada > menor preço das variantes com estoque > menor preço geral
  const displayPrice = useMemo(() => {
    if (resolvedPrice !== null) return { price: resolvedPrice, prefix: "" };
    if (!product) return null;
    const withStock = product.variants.filter((v) => v.stock > 0);
    const pool = withStock.length > 0 ? withStock : product.variants;
    if (pool.length === 0) return null;
    const min = Math.min(...pool.map((v) => v.price_cents));
    const max = Math.max(...pool.map((v) => v.price_cents));
    return { price: min, prefix: min < max ? "A partir de " : "" };
  }, [resolvedPrice, product]);

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
          message="Buscando fotos, variantes e disponibilidade."
        />
      ) : null}

      {product ? (
        <section className="grid gap-6 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)] lg:items-start">
          {/* Coluna esquerda: imagens */}
          <div className="space-y-4">
            <ProductImageCarousel images={product.images} />
            {product.images.length > 0 ? (
              <PublicPanel>
                <span className="rounded-full border border-[var(--color-line)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-muted)]">
                  {product.images.length} foto(s)
                </span>
              </PublicPanel>
            ) : null}
          </div>

          {/* Coluna direita: info + seletor */}
          <div className="space-y-5 rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(16,26,47,0.96),rgba(10,18,33,0.96))] p-6 shadow-[0_20px_54px_rgba(0,0,0,0.24)]">
            {/* Título e descrição */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--color-accent)]">
                Produto
              </p>
              <h1 className="font-display text-3xl font-semibold leading-tight text-[var(--color-text-primary)]">
                {product.title}
              </h1>
              {product.description ? (
                <p className="text-sm leading-6 text-[var(--color-text-secondary)]">
                  {product.description}
                </p>
              ) : null}
            </div>

            {/* Preço */}
            <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)]/88 px-5 py-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Preco</p>
              <p className="mt-1 font-display text-4xl font-semibold text-[var(--color-text-primary)]">
                {displayPrice ? (
                  <>
                    {displayPrice.prefix ? (
                      <span className="text-lg font-normal text-[var(--color-text-secondary)]">
                        {displayPrice.prefix}
                      </span>
                    ) : null}
                    {formatCents(displayPrice.price)}
                  </>
                ) : "--"}
              </p>
            </div>

            {/* Seletor por dimensões agrupadas */}
            {hasDimensions && product.variants.length > 0 ? (
              <div className="space-y-5">
                {dimensions.map((dim) => {
                  const values = valuesForDimension(product.variants, dim);
                  const selectedValue = selectedDimensions[dim];

                  return (
                    <div key={dim} className="space-y-2">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold capitalize text-[var(--color-text-primary)]">
                          {dim}
                        </p>
                        {selectedValue ? (
                          <span className="rounded-full bg-[var(--color-accent-soft)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-accent)]">
                            {selectedValue}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)]">— selecione</span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {values.map((val) => {
                          const partial = { ...selectedDimensions, [dim]: val };
                          const isSelected = selectedValue === val;
                          const hasStock = hasAnyStockForPartial(product.variants, partial);

                          return (
                            <button
                              key={val}
                              type="button"
                              disabled={!hasStock}
                              onClick={() => handleSelectDimension(dim, val)}
                              className={`min-w-[44px] rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                                isSelected
                                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                                  : hasStock
                                    ? "border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] hover:border-[var(--color-line-strong)]"
                                    : "cursor-not-allowed border-[var(--color-line)] bg-[var(--color-surface-1)] text-[var(--color-text-muted)] line-through opacity-50"
                              }`}
                              aria-pressed={isSelected}
                              title={!hasStock ? "Sem estoque para esta opção" : undefined}
                            >
                              {val}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Resumo da seleção */}
                <div className="rounded-[22px] border border-[var(--color-line)] bg-[var(--color-surface-1)]/88 px-5 py-4">
                  {allDimensionsSelected && selectedVariant ? (
                    <div className="flex flex-col gap-1">
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
                        Selecionado
                      </p>
                      <p className="font-semibold text-[var(--color-text-primary)]">
                        {dimensions.map((d) => selectedDimensions[d]).join(" · ")}
                      </p>
                      {selectedVariant.stock <= 0 ? (
                        <p className="mt-1 text-xs font-semibold text-[var(--color-danger-text)]">
                          Sem estoque para esta combinação
                        </p>
                      ) : selectedVariant.stock <= 3 ? (
                        <p className="mt-1 text-xs text-[var(--color-warning-text)]">
                          Últimas {selectedVariant.stock} unidade(s)
                        </p>
                      ) : (
                        <p className="mt-1 text-xs text-[var(--color-success-text)]">
                          Disponível para compra
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-[var(--color-text-muted)]">
                      {dimensions.filter((d) => !(d in selectedDimensions)).length === dimensions.length
                        ? "Selecione as opções acima para continuar."
                        : `Selecione também: ${dimensions.filter((d) => !(d in selectedDimensions)).join(", ")}`}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={!canAddToCart}
                  className="w-full rounded-xl bg-[var(--color-accent)] py-3.5 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {!allDimensionsSelected
                    ? "Selecione todas as opções"
                    : selectedVariant === null
                      ? "Combinação indisponível"
                      : selectedVariant.stock <= 0
                        ? "Sem estoque"
                        : "Adicionar ao carrinho"}
                </button>
              </div>
            ) : useFallbackCardSelector ? (
              // Fallback: variantes sem atributos estruturados
              <div className="space-y-3">
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  Escolha a variante
                </p>
                <div className="space-y-2">
                  {product.variants.map((v) => {
                    const isSelected = fallbackSelectedId === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setFallbackSelectedId(v.id)}
                        className={`flex w-full items-center justify-between rounded-[18px] border px-4 py-3 text-left transition ${
                          isSelected
                            ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                            : "border-[var(--color-line)] bg-[var(--color-surface-1)]/88 hover:border-[var(--color-line-strong)]"
                        }`}
                      >
                        <span className="font-semibold text-[var(--color-text-primary)]">{v.sku}</span>
                        <span className="text-sm text-[var(--color-text-secondary)]">
                          {v.stock > 0 ? formatCents(v.price_cents) : "Sem estoque"}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <button
                  type="button"
                  onClick={handleAddFallback}
                  disabled={!fallbackVariant || fallbackVariant.stock <= 0}
                  className="w-full rounded-xl bg-[var(--color-accent)] py-3.5 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)] disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {!fallbackVariant || fallbackVariant.stock <= 0 ? "Sem estoque" : "Adicionar ao carrinho"}
                </button>
              </div>
            ) : (
              <EmptyState
                title="Sem variantes para compra"
                message="Este produto ainda nao possui uma opcao pronta para ser adicionada ao carrinho."
              />
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
