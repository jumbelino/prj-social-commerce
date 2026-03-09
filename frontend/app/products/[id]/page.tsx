"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { ErrorPanel } from "@/components/error-panel";
import { ApiRequestError, getProductById, type Product } from "@/lib/api";
import { formatCents } from "@/lib/currency";

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params.id;
  const { addItem } = useCart();

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    async function run() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getProductById(productId);
        if (isActive) {
          setProduct(data);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : "Unexpected failure while loading product.";
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

  const hasVariants = useMemo(() => (product?.variants.length ?? 0) > 0, [product]);

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Product detail</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">{product?.title ?? "Product"}</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Inspect variants, stock and add specific SKU entries to your cart.
        </p>
      </section>

      <Link
        href="/"
        className="inline-flex rounded-lg border border-[var(--color-line)] bg-white/80 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
      >
        Back to products
      </Link>

      {errorMessage ? <ErrorPanel title="Could not load product" message={errorMessage} /> : null}

      {isLoading ? (
        <section className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/70 px-5 py-10 text-center text-[var(--color-muted)]">
          Loading product...
        </section>
      ) : null}

      {product ? (
        <section className="space-y-4 rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-6 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
          <p className="text-base text-slate-700">{product.description ?? "No description available."}</p>

          {hasVariants ? (
            <div className="space-y-3">
              {product.variants.map((variant) => (
                <article
                  key={variant.id}
                  className="rounded-xl border border-[var(--color-line)] bg-[#fbf8f1] p-4 sm:flex sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="font-semibold text-slate-900">{variant.sku}</p>
                    <p className="text-sm text-[var(--color-muted)]">Stock: {variant.stock}</p>
                    <p className="text-sm text-[var(--color-muted)]">{formatCents(variant.price_cents)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      addItem({
                        productId: product.id,
                        productTitle: product.title,
                        variantId: variant.id,
                        sku: variant.sku,
                        unitPriceCents: variant.price_cents,
                      })
                    }
                    className="mt-3 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95 sm:mt-0"
                  >
                    Add variant
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--color-muted)]">This product has no variants available.</p>
          )}
        </section>
      ) : null}
    </div>
  );
}
