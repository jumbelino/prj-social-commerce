"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";

import { useCart } from "@/components/cart-provider";
import { ErrorPanel } from "@/components/error-panel";
import { ApiRequestError, listProducts, type Product } from "@/lib/api";
import { formatCents } from "@/lib/currency";

export default function Home() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const { addItem } = useCart();

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
            : "Unexpected failure while loading products.";
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
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Storefront</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Products</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Explore active products from the backend API and add variants to your cart.
        </p>
      </section>

      {errorMessage ? (
        <ErrorPanel title="Could not load products" message={errorMessage} />
      ) : null}

      {isLoading ? (
        <section className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/70 px-5 py-10 text-center text-[var(--color-muted)]">
          Loading products...
        </section>
      ) : (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleProducts.map((product) => {
            const primaryVariant = product.variants[0];
            return (
              <article
                key={product.id}
                className="group rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)] transition hover:-translate-y-1 hover:shadow-[0_14px_32px_rgba(18,30,40,0.1)]"
              >
                <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg bg-slate-100">
                  {product.images[0]?.url ? (
                    <Link href={`/products/${product.id}`}>
                      <Image
                        src={product.images[0].url}
                        alt={product.title}
                        fill
                        className="object-cover"
                      />
                    </Link>
                  ) : (
                    <Link href={`/products/${product.id}`} className="flex h-full w-full items-center justify-center text-slate-400">
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        strokeWidth={1.5}
                        stroke="currentColor"
                        className="h-12 w-12"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                        />
                      </svg>
                    </Link>
                  )}
                </div>
                <Link href={`/products/${product.id}`}>
                  <h2 className="font-display text-2xl text-slate-900 mt-4">{product.title}</h2>
                </Link>
                <p className="mt-2 line-clamp-3 text-sm text-[var(--color-muted)]">
                  {product.description ?? "No description available."}
                </p>
                <div className="mt-4 rounded-xl bg-[#f8f4ea] px-3 py-2 text-sm text-slate-700">
                  <p className="font-semibold">{formatCents(primaryVariant.price_cents)}</p>
                  <p>SKU: {primaryVariant.sku}</p>
                  <p>Stock: {primaryVariant.stock}</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link
                    className="rounded-lg border border-[var(--color-line)] px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
                    href={`/products/${product.id}`}
                  >
                    View detail
                  </Link>
                  <button
                    className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95"
                    type="button"
                    onClick={() =>
                      addItem({
                        productId: product.id,
                        productTitle: product.title,
                        variantId: primaryVariant.id,
                        sku: primaryVariant.sku,
                        unitPriceCents: primaryVariant.price_cents,
                      })
                    }
                  >
                    Add to cart
                  </button>
                </div>
              </article>
            );
          })}
          {visibleProducts.length === 0 ? (
            <article className="rounded-2xl border border-dashed border-[var(--color-line)] bg-white/75 p-6 text-sm text-[var(--color-muted)]">
              No active products with variants were returned by the API.
            </article>
          ) : null}
        </section>
      )}
    </div>
  );
}
