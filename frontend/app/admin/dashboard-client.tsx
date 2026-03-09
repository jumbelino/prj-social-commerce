"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

import { DateRangePicker, DateRange } from "@/components/admin/DateRangePicker";
import { DashboardMetrics } from "@/components/admin/DashboardMetrics";

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

export function DashboardClient() {
  const today = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange>({
    start: subDays(today, 7),
    end: today,
  });

  const quickActions = [
    {
      label: "Novo Pedido",
      href: "/admin/assisted-sale",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
    },
    {
      label: "Novo Produto",
      href: "/admin/products/new",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      label: "Pedidos Pendentes",
      href: "/admin/orders?status=pending",
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-display text-lg font-semibold text-[var(--color-text)]">
            Período
          </h2>
          <DateRangePicker value={dateRange} onChange={setDateRange} />
        </div>
      </section>

      <DashboardMetrics dateRange={dateRange} />

      <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5">
        <h2 className="mb-4 font-display text-lg font-semibold text-[var(--color-text)]">
          Atalhos
        </h2>
        <div className="flex flex-wrap gap-3">
          {quickActions.map((action) => (
            <Link
              key={action.href}
              href={action.href}
              className="flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white/80 px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition hover:border-[var(--color-accent)] hover:bg-white hover:shadow-md"
            >
              {action.icon}
              {action.label}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
