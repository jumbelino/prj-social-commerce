"use client";

import { useEffect, useState } from "react";
import { getDashboardMetrics } from "@/lib/api";
import type { DashboardMetrics as DashboardMetricsData } from "@/lib/api";

interface DateRange {
  start: Date;
  end: Date;
}

interface DashboardMetricsProps {
  dateRange: DateRange;
}

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDateForApi(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
}

function MetricCard({ title, value, icon }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_4px_20px_rgba(18,30,40,0.06)] transition hover:shadow-[0_8px_30px_rgba(18,30,40,0.1)]">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
            {title}
          </p>
          <p className="mt-2 font-display text-3xl font-bold leading-tight text-[var(--color-text)]">
            {value}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-bg-soft)] text-[var(--color-muted)]">
          {icon}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {[...Array(4)].map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5"
        >
          <div className="flex items-start justify-between">
            <div>
              <div className="mb-2 h-3 w-16 rounded bg-[var(--color-line)]"></div>
              <div className="h-8 w-24 rounded bg-[var(--color-line)]"></div>
            </div>
            <div className="h-10 w-10 rounded-xl bg-[var(--color-line)]"></div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function DashboardMetrics({ dateRange }: DashboardMetricsProps) {
  const [metrics, setMetrics] = useState<DashboardMetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchMetrics() {
      setLoading(true);
      setError(null);

      try {
        const startDate = formatDateForApi(dateRange.start);
        const endDate = formatDateForApi(dateRange.end);
        const data = await getDashboardMetrics({ start_date: startDate, end_date: endDate });

        if (!cancelled) {
          setMetrics(data);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Erro ao carregar métricas");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchMetrics();

    return () => {
      cancelled = true;
    };
  }, [dateRange]);

  if (loading) {
    return <LoadingSkeleton />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-[var(--color-danger-text)] bg-[var(--color-danger-bg)] p-4 text-sm text-[var(--color-danger-text)]">
        {error}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const metricCards = [
    {
      title: "Pedidos",
      value: metrics.order_count,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
        </svg>
      ),
    },
    {
      title: "Vendas",
      value: formatPrice(metrics.sales_total_cents),
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      title: "Produtos Ativos",
      value: metrics.active_products,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      ),
    },
    {
      title: "Clientes",
      value: metrics.customer_count,
      icon: (
        <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metricCards.map((metric) => (
        <MetricCard key={metric.title} {...metric} />
      ))}
    </div>
  );
}
