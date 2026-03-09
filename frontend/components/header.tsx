"use client";

import Link from "next/link";
import { useState } from "react";
import { CartLink } from "@/components/cart-link";

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-4 z-20 mt-4 rounded-2xl border border-black/10 bg-white/90 px-4 py-3 shadow-[0_10px_30px_rgba(11,18,32,0.09)] backdrop-blur sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <Link href="/" className="font-display text-xl leading-none tracking-tight text-slate-900">
          Local Market
        </Link>
        
        <nav className="hidden items-center gap-4 text-sm font-semibold text-slate-700 sm:flex">
          <Link href="/" className="transition hover:text-slate-950">
            Products
          </Link>
          <Link href="/cart" className="transition hover:text-slate-950">
            <CartLink />
          </Link>
        </nav>

        <button
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          className="flex h-8 w-8 flex-col items-center justify-center gap-1.5 rounded-lg border border-slate-200 sm:hidden"
          aria-label="Toggle menu"
        >
          <span className={`h-0.5 w-5 bg-slate-700 transition-transform ${isMenuOpen ? "rotate-45 translate-y-1" : ""}`} />
          <span className={`h-0.5 w-5 bg-slate-700 transition-opacity ${isMenuOpen ? "opacity-0" : ""}`} />
          <span className={`h-0.5 w-5 bg-slate-700 transition-transform ${isMenuOpen ? "-rotate-45 -translate-y-1" : ""}`} />
        </button>
      </div>

      {isMenuOpen && (
        <div className="absolute left-0 right-0 top-full mt-2 rounded-2xl border border-black/10 bg-white/95 p-4 shadow-lg backdrop-blur sm:hidden">
          <nav className="flex flex-col gap-3 text-sm font-semibold text-slate-700">
            <Link href="/" onClick={closeMenu} className="rounded-lg px-3 py-2 transition hover:bg-slate-100">
              Products
            </Link>
            <Link href="/cart" onClick={closeMenu} className="rounded-lg px-3 py-2 transition hover:bg-slate-100">
              Cart
            </Link>
          </nav>
        </div>
      )}
    </header>
  );
}
