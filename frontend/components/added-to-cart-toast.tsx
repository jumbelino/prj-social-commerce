"use client";

import Link from "next/link";
import { useEffect } from "react";

type AddedToCartToastProps = {
  productTitle: string;
  sku: string;
  onClose: () => void;
};

export function AddedToCartToast({ productTitle, sku, onClose }: AddedToCartToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onClose, 4000);
    return () => window.clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex w-full max-w-xs flex-col gap-3 rounded-2xl border border-green-200 bg-white p-4 shadow-[0_12px_32px_rgba(0,0,0,0.14)] animate-[fadeSlideUp_0.3s_ease]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100 text-green-600 text-lg">
          ✓
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 text-sm leading-snug">Produto adicionado!</p>
          <p className="text-xs text-slate-500 mt-0.5 truncate">
            {productTitle} — {sku}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar notificação"
          className="ml-auto text-slate-400 hover:text-slate-600 transition text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2">
        <Link
          href="/cart"
          className="flex-1 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-center text-xs font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95"
        >
          Ver carrinho
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-slate-400"
        >
          Continuar comprando
        </button>
      </div>
    </div>
  );
}
