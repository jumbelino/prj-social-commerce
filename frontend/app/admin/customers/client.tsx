"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchAdminCustomers, type CustomerRead } from "@/lib/api";
import { DataTable, type Column } from "@/components/admin/DataTable";
import { ErrorPanel } from "@/components/error-panel";
import EmptyState from "@/components/admin/EmptyState";

const PAGE_SIZE = 20;

export function CustomersClient() {
  const router = useRouter();
  const [customers, setCustomers] = useState<CustomerRead[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [searchQuery, setSearchQuery] = useState("");
  
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState<number | undefined>(undefined);

  const loadCustomers = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const data = await searchAdminCustomers({ query: searchQuery || undefined, limit: PAGE_SIZE, offset });
      setCustomers(data);
      setTotal(data.length < PAGE_SIZE ? offset + data.length : undefined);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro ao carregar clientes");
    } finally {
      setIsLoading(false);
    }
  }, [page, searchQuery]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleRowClick = (customer: CustomerRead) => {
    router.push(`/admin/customers/${customer.id}`);
  };

  const columns: Column<CustomerRead>[] = [
    { key: "name", header: "Nome" },
    { key: "email", header: "Email" },
    { key: "phone", header: "Telefone" },
    { 
      key: "total_orders", 
      header: "Pedidos", 
      render: (c) => c.total_orders ?? 0
    },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-slate-900">Clientes</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Gerencie seus clientes e visualize seus pedidos.
        </p>
      </section>

      {error && <ErrorPanel title="Erro" message={error} />}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Buscar por nome, email ou telefone..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
      </div>

      <DataTable
        columns={columns}
        data={customers}
        onRowClick={handleRowClick}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
        onPageChange={handlePageChange}
        emptyMessage="Nenhum cliente encontrado"
        isLoading={isLoading}
      />

      {!isLoading && customers.length === 0 && (
        <EmptyState
          icon="👥"
          title="Nenhum cliente encontrado"
          description="Os clientes aparecerão aqui"
        />
      )}
    </div>
  );
}
