"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ProductCard } from "@/components/storefront/ProductCard";
import { PublicHero, PublicPanel, PublicSection } from "@/components/storefront/PublicShell";
import { EmptyState, ErrorState, LoadingState } from "@/components/storefront/StateBlocks";
import { ApiRequestError, listProducts, type Product } from "@/lib/api";

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
        actions={
          <>
            <Link
              href="#catalogo"
              className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
            >
              Explorar catalogo
            </Link>
            <Link
              href="/cart"
              className="inline-flex items-center justify-center rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
            >
              Ver carrinho
            </Link>
          </>
        }
      >
        <PublicPanel>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Direcao</p>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">Dark-first, tecnica e limpa</p>
            </div>
            <div className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Compra</p>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">Catalogo, frete e checkout diretos</p>
            </div>
            <div className="rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface-1)] p-4">
              <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Foco</p>
              <p className="mt-2 text-sm font-medium text-[var(--color-text-primary)]">Imagem, preco e confianca</p>
            </div>
          </div>
        </PublicPanel>
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
