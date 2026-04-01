"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { ProductCard } from "@/components/storefront/ProductCard";
import { PublicHero, PublicPanel, PublicSection } from "@/components/storefront/PublicShell";
import { EmptyState, ErrorState, LoadingState } from "@/components/storefront/StateBlocks";
import { ApiRequestError, listProducts, type Product } from "@/lib/api";
import { formatCents } from "@/lib/currency";

function HeroCarousel({ products }: { products: Product[] }) {
  const [index, setIndex] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const slides = useMemo(
    () =>
      products
        .filter((p) => p.images && p.images.length > 0)
        .slice(0, 6)
        .map((p) => ({
          src: p.images[0].url,
          title: p.title,
          price: p.variants[0]?.price_cents,
        })),
    [products],
  );

  useEffect(() => {
    if (slides.length <= 1) return;
    timerRef.current = setInterval(() => {
      setIndex((prev) => (prev + 1) % slides.length);
    }, 4000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [slides.length]);

  if (slides.length === 0) {
    return (
      <PublicPanel>
        <div className="flex h-40 items-center justify-center text-sm text-[var(--color-text-muted)]">
          Nenhuma imagem disponível
        </div>
      </PublicPanel>
    );
  }

  return (
    <PublicPanel>
      <div className="relative overflow-hidden rounded-[18px]">
        <div className="aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-[var(--color-surface-3)]">
          {slides.map((slide, i) => (
            <img
              key={i}
              src={slide.src}
              alt={slide.title}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
                i === index ? "opacity-100" : "opacity-0"
              }`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <p className="text-sm font-semibold text-white leading-tight">
              {slides[index].title}
            </p>
            {slides[index].price !== undefined && (
              <p className="mt-0.5 text-xs text-white/80">
                {formatCents(slides[index].price!)}
              </p>
            )}
          </div>
        </div>

        {slides.length > 1 && (
          <div className="mt-3 flex justify-center gap-1.5">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setIndex(i);
                  if (timerRef.current) clearInterval(timerRef.current);
                  timerRef.current = setInterval(() => {
                    setIndex((prev) => (prev + 1) % slides.length);
                  }, 4000);
                }}
                className={`h-1.5 rounded-full transition-all ${
                  i === index
                    ? "w-5 bg-[var(--color-accent)]"
                    : "w-1.5 bg-[var(--color-line-strong)]"
                }`}
              />
            ))}
          </div>
        )}
      </div>
    </PublicPanel>
  );
}

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function run() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await listProducts();
        if (isActive) {
          setProducts(data);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError
            ? error.message
            : "Falha inesperada ao carregar o catalogo.";
        if (isActive) {
          setErrorMessage(message);
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
  }, []);

  const visibleProducts = useMemo(
    () => products.filter((product) => product.active && product.variants.length > 0),
    [products],
  );

  return (
    <div className="space-y-8">
      <PublicHero
        eyebrow="Aurea Shirts"
        title="Camisetas com vitrine simples, compra clara e visual de loja real."
        description="Uma storefront mais limpa, escura e objetiva para destacar produto, preco e decisao de compra sem cara de MVP tecnico."
      >
        {!isLoading && visibleProducts.length > 0 ? (
          <HeroCarousel products={visibleProducts} />
        ) : null}
      </PublicHero>

      <PublicSection
        eyebrow="Catalogo"
        title="Escolha a proxima camiseta da vitrine"
        description="Cards focados em imagem, preco e contexto suficiente para seguir ao detalhe sem ruido visual."
        actions={
          <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-text-secondary)]">
            {visibleProducts.length} itens ativos
          </div>
        }
      >
        <div id="catalogo">
          {errorMessage ? (
            <ErrorState
              title="Nao foi possivel carregar o catalogo"
              message={errorMessage}
              action={
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-1)] px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)]"
                >
                  Tentar novamente
                </button>
              }
            />
          ) : null}

          {isLoading ? (
            <LoadingState
              title="Carregando catalogo"
              message="Buscando os produtos ativos para montar a vitrine da loja."
            />
          ) : null}

          {!isLoading && !errorMessage && visibleProducts.length === 0 ? (
            <EmptyState
              title="Nenhum produto disponivel no momento"
              message="A vitrine ainda nao recebeu itens ativos com variantes validas. Volte em instantes ou ajuste o catalogo pelo admin."
            />
          ) : null}

          {!isLoading && !errorMessage && visibleProducts.length > 0 ? (
            <section className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {visibleProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </section>
          ) : null}
        </div>
      </PublicSection>
    </div>
  );
}
