"use client";

import { useCart } from "@/components/cart-provider";

export function CartLink() {
  const { itemCount } = useCart();

  return (
    <span className="inline-flex items-center gap-2">
      <span>Carrinho</span>
      <span className="inline-flex min-w-5 items-center justify-center rounded-full border border-[var(--color-line-strong)] bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-accent)]">
        {itemCount}
      </span>
    </span>
  );
}
