"use client";

import Link from "next/link";
import { useState } from "react";
import { CartLink } from "@/components/cart-link";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-3 z-20 mt-4 rounded-[22px] border border-[var(--color-line)] bg-[rgba(9,18,33,0.82)] px-4 py-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)] backdrop-blur sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="flex flex-col" onClick={closeMenu}>
          <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--color-accent)]">
            Loja
          </span>
          <span className="font-display text-xl leading-none tracking-tight text-[var(--color-text-primary)] sm:text-2xl">
            Aurea Shirts
          </span>
        </Link>
        
        <nav className="hidden items-center gap-3 text-sm font-semibold text-[var(--color-text-secondary)] sm:flex">
          <Link
            href="/"
            className="rounded-full border border-transparent px-3 py-2 transition hover:border-[var(--color-line)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text-primary)]"
          >
            Catalogo
          </Link>
          <Link
            href="/cart"
            className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-2 text-[var(--color-text-primary)] transition hover:border-[var(--color-line-strong)] hover:bg-[var(--color-surface-3)]"
          >
            <CartLink />
          </Link>
        </nav>

        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-text-primary)] sm:hidden"
          aria-label={isMenuOpen ? "Fechar menu" : "Abrir menu"}
        >
          <span className={`h-0.5 w-5 bg-current transition-transform ${isMenuOpen ? "rotate-45 translate-y-1" : ""}`} />
          <span className={`h-0.5 w-5 bg-current transition-opacity ${isMenuOpen ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-5 bg-current transition-transform ${isMenuOpen ? "-rotate-45 -translate-y-1" : ""}`} />
        </button>
      </div>

      {isMenuOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-[22px] border border-[var(--color-line)] bg-[rgba(9,18,33,0.96)] p-4 shadow-[0_18px_50px_rgba(0,0,0,0.3)] backdrop-blur sm:hidden">
          <nav className="flex flex-col gap-3 text-sm font-semibold text-[var(--color-text-primary)]">
            <Link
              href="/"
              onClick={closeMenu}
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-3 transition hover:border-[var(--color-line-strong)]"
            >
              Catalogo
            </Link>
            <Link
              href="/cart"
              onClick={closeMenu}
              className="rounded-xl border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-3 transition hover:border-[var(--color-line-strong)]"
            >
              <CartLink />
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
