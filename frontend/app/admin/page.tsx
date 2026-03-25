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
              Visão geral das operações.
            </p>
          </div>
        </div>
      </section>

      <DashboardClient />
    </div>
  );
}
