"use client";

import Image from "next/image";
import Link from "next/link";

import type { Product } from "@/lib/api";
import { formatCents } from "@/lib/currency";

type ProductCardProps = {
  product: Product;
};

function hasSinglePurchasableVariant(product: Product): boolean {
  return product.variants.length === 1 && product.variants[0].stock > 0;
}

export function ProductCard({ product }: ProductCardProps) {
  const primaryVariant = product.variants[0];
  const showSingleVariantHint = hasSinglePurchasableVariant(product);

  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-[24px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(22,35,60,0.92),rgba(13,23,41,0.98))] shadow-[0_16px_42px_rgba(0,0,0,0.22)] transition duration-200 hover:-translate-y-1 hover:border-[var(--color-line-strong)] hover:shadow-[0_24px_60px_rgba(0,0,0,0.3)]">
      <Link href={`/products/${product.id}`} className="relative block aspect-[4/4.6] overflow-hidden bg-[var(--color-surface-3)]">
        {product.images[0]?.url ? (
          <>
            <Image
              src={product.images[0].url}
              alt={product.title}
              fill
              className="object-cover transition duration-300 group-hover:scale-[1.03]"
            />
            <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[#07111f]/90 via-[#07111f]/35 to-transparent" />
          </>
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle,rgba(104,179,255,0.12),transparent_52%)] text-[var(--color-text-muted)]">
            <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)]/70 px-4 py-2 text-xs font-medium uppercase tracking-[0.22em]">
              Sem imagem
            </div>
          </div>
        )}
      </Link>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
              Camiseta
            </p>
            <h3 className="mt-2 font-display text-2xl font-semibold leading-tight text-[var(--color-text-primary)]">
              {product.title}
            </h3>
          </div>
          <span className="rounded-full border border-[var(--color-line)] bg-[var(--color-accent-soft)] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--color-accent)]">
            {product.images.length > 0 ? `${product.images.length} fotos` : "fallback"}
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--color-text-secondary)]">
          {product.description ?? "Camiseta com acabamento simples, pronta para pedido online."}
        </p>

        <div className="mt-5 space-y-2 rounded-[18px] border border-[var(--color-line)] bg-[var(--color-surface-1)]/85 p-4">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">A partir de</p>
          <p className="font-display text-3xl font-semibold text-[var(--color-text-primary)]">
            {formatCents(primaryVariant.price_cents)}
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <span className="rounded-full border border-[var(--color-line)] px-2.5 py-1">
              {product.variants.length} {product.variants.length === 1 ? "variante" : "variantes"}
            </span>
            <span className="rounded-full border border-[var(--color-line)] px-2.5 py-1">
              {primaryVariant.stock > 0 ? "Em estoque" : "Estoque reduzido"}
            </span>
          </div>
        </div>

        {showSingleVariantHint ? (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-muted)]">
            Produto com uma unica variante valida. A compra segue pelo detalhe para manter a decisao clara.
          </p>
        ) : (
          <p className="mt-4 text-xs leading-5 text-[var(--color-text-muted)]">
            Veja as fotos, disponibilidade e variantes antes de adicionar ao carrinho.
          </p>
        )}

        <div className="mt-5 pt-1">
          <Link
            href={`/products/${product.id}`}
            className="inline-flex items-center justify-center rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
          >
            Ver produto
          </Link>
        </div>
      </div>
    </article>
  );
}
