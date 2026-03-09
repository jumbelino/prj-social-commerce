"use client";

import Link from "next/link";

interface AdminHeaderProps {
  userName: string | null | undefined;
  onMenuClick: () => void;
}

export function AdminHeader({ userName, onMenuClick }: AdminHeaderProps) {
  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-[var(--color-line)] bg-[var(--color-card)] px-4 lg:px-6">
      <div className="flex items-center gap-4">
        <button
          onClick={onMenuClick}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-line)] text-[var(--color-muted)] transition hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)] lg:hidden"
          aria-label="Toggle menu"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>

      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-[var(--color-muted)] sm:inline">
          {userName ?? "Admin"}
        </span>
        <Link
          href="/api/auth/signout?callbackUrl=%2F"
          className="rounded-lg border border-[var(--color-line)] bg-white/80 px-3 py-1.5 text-sm font-medium text-[var(--color-text)] transition hover:border-slate-400 hover:bg-white"
        >
          Sign out
        </Link>
      </div>
    </header>
  );
}
