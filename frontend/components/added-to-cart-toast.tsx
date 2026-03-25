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
      className="fixed bottom-6 right-6 z-50 flex w-full max-w-sm flex-col gap-4 rounded-[24px] border border-[var(--color-line)] bg-[rgba(9,18,33,0.96)] p-4 text-[var(--color-text-primary)] shadow-[0_18px_40px_rgba(0,0,0,0.34)] backdrop-blur animate-[fadeSlideUp_0.3s_ease]"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-success-text)]/20 bg-[var(--color-success-bg)] text-[var(--color-success-text)] text-lg">
          +
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-accent)]">
            Carrinho atualizado
          </p>
          <p className="mt-1 text-sm font-semibold leading-snug text-[var(--color-text-primary)]">
            Produto adicionado ao carrinho
          </p>
          <p className="mt-1 truncate text-xs text-[var(--color-text-secondary)]">
            {productTitle} · {sku}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar notificação"
          className="ml-auto text-[var(--color-text-muted)] transition hover:text-[var(--color-text-primary)] text-lg leading-none"
        >
          ×
        </button>
      </div>
      <div className="flex gap-2">
        <Link
          href="/cart"
          className="flex-1 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-center text-xs font-semibold text-[#04101f] transition hover:bg-[var(--color-accent-hover)]"
        >
          Ver carrinho
        </Link>
        <button
          type="button"
          onClick={onClose}
          className="flex-1 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)]"
        >
          Continuar vendo
        </button>
      </div>
    </div>
  );
}
