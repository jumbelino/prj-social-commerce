import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { DashboardClient } from "./dashboard-client";
import { authOptions } from "@/auth";
import { getAdminLoginRedirect } from "@/lib/auth-redirect";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session.roles?.includes("admin")) {
    redirect(getAdminLoginRedirect());
  }

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Dashboard</h1>
            <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
              Visão geral das operações. Autenticado com Keycloak.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
            <span className="rounded-full border border-[var(--color-line)] bg-white/80 px-3 py-1">
              {session.user?.email ?? session.user?.name ?? "admin"}
            </span>
            <Link
              href="/api/auth/signout?callbackUrl=%2F"
              className="rounded-lg border border-[var(--color-line)] bg-white/85 px-3 py-1.5 font-semibold transition hover:border-slate-400 hover:text-slate-900"
            >
              Sair
            </Link>
          </div>
        </div>
      </section>

      <DashboardClient />
    </div>
  );
}
