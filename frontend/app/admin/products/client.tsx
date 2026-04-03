"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { listAdminProducts, deleteAdminProduct, toggleAdminProductActive, type Product } from "@/lib/api";
import { DataTable, type Column } from "@/components/admin/DataTable";
import ConfirmModal from "@/components/admin/ConfirmModal";
import { ErrorPanel } from "@/components/error-panel";
import EmptyState from "@/components/admin/EmptyState";

const PAGE_SIZE = 20;

function formatPrice(cents: number | undefined): string {
  if (cents === undefined || cents === null) return "-";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

interface ProductsClientProps {
  initialProducts: Product[];
}

export function ProductsClient({ initialProducts }: ProductsClientProps) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const loadProducts = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const activeFilter = statusFilter === "active" ? true : statusFilter === "inactive" ? false : undefined;
      const offset = (page - 1) * PAGE_SIZE;
      const data = await listAdminProducts({ active: activeFilter, limit: PAGE_SIZE + 1, offset });
      
      setHasNextPage(data.length > PAGE_SIZE);

      let filteredData = data.slice(0, PAGE_SIZE);
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        filteredData = filteredData.filter(p => p.title.toLowerCase().includes(query));
      }
      
      setProducts(filteredData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load products");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, page, searchQuery]);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  const handlePageChange = (newPage: number) => {
    setPage(newPage);
  };

  const handleEdit = (product: Product) => {
    router.push(`/admin/products/${product.id}`);
  };

  const handleDeleteClick = (product: Product) => {
    setProductToDelete(product);
    setDeleteModalOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!productToDelete) return;
    
    setIsDeleting(true);
    setError(null);
    setSuccessMessage(null);
    try {
      await deleteAdminProduct(productToDelete.id);
      setSuccessMessage("Produto removido. Se houver histórico de venda, ele foi arquivado automaticamente.");
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete product");
    } finally {
      setIsDeleting(false);
      setDeleteModalOpen(false);
      setProductToDelete(null);
    }
  };

  const handleToggleActive = async (product: Product) => {
    setError(null);
    setSuccessMessage(null);
    try {
      const updated = await toggleAdminProductActive(product.id, !product.active);
      setProducts(prev => prev.map(p => p.id === product.id ? { ...p, active: updated.active } : p));
      setSuccessMessage(updated.active ? "Produto ativado com sucesso." : "Produto desativado com sucesso.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update product status");
    }
  };

  const columns: Column<Product>[] = [
    { key: "title", header: "Título" },
    { 
      key: "sku", 
      header: "SKU", 
      render: (p) => p.variants?.[0]?.sku || "-" 
    },
    { 
      key: "price_cents", 
      header: "Preço", 
      render: (p) => formatPrice(p.variants?.[0]?.price_cents) 
    },
    { 
      key: "stock", 
      header: "Estoque", 
      render: (p) => p.variants?.[0]?.stock ?? 0 
    },
    { 
      key: "active", 
      header: "Status", 
      render: (p) => (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
          p.active
            ? "bg-green-500/20 text-green-300"
            : "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
        }`}>
          {p.active ? "Ativo" : "Inativo"}
        </span>
      )
    },
    {
      key: "actions",
      header: "Ações",
      render: (p) => (
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
            className="rounded border border-[var(--color-line)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-medium text-[var(--color-text)] transition hover:border-[var(--color-line-strong)]"
          >
            Editar
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleToggleActive(p); }}
            className={`rounded px-3 py-1.5 text-xs font-medium transition ${
              p.active
                ? "border border-[var(--color-line)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-surface-3)]"
                : "border border-green-500/30 bg-green-500/10 text-green-300 hover:bg-green-500/20"
            }`}
          >
            {p.active ? "Desativar" : "Ativar"}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDeleteClick(p); }}
            className="rounded border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700 transition hover:bg-red-100"
          >
            Excluir
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-[var(--color-line)] bg-[var(--color-card)] px-5 py-7 shadow-[0_14px_36px_rgba(18,30,40,0.08)] sm:px-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-muted)]">Admin</p>
        <h1 className="mt-3 font-display text-4xl leading-tight text-[var(--color-text)]">Produtos</h1>
        <p className="mt-2 max-w-2xl text-base text-[var(--color-muted)]">
          Gerencie seus produtos, variantes e estoque.
        </p>
      </section>

      {error && <ErrorPanel title="Erro" message={error} />}
      {successMessage && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 p-3 text-sm text-green-300">
          {successMessage}
        </div>
      )}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-1)] text-[var(--color-text)] px-3 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
          >
            <option value="">Todos os status</option>
            <option value="active">Ativo</option>
            <option value="inactive">Inativo</option>
          </select>
          
          <input
            type="text"
            placeholder="Buscar por título..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
          />
        </div>
        
        <button
          onClick={() => router.push("/admin/products/new")}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] transition hover:opacity-90"
        >
          Novo Produto
        </button>
      </div>

      <DataTable
        columns={columns}
        data={products}
        page={page}
        pageSize={PAGE_SIZE}
        hasNext={hasNextPage}
        onPageChange={handlePageChange}
        emptyMessage="Nenhum produto encontrado"
        isLoading={isLoading}
      />

      {!isLoading && products.length === 0 && (
        <EmptyState
          icon="📦"
          title="Nenhum produto cadastrado"
          description="Comece adicionando seu primeiro produto"
          action={{
            label: "Criar produto",
            onClick: () => router.push("/admin/products/new"),
          }}
        />
      )}

      <ConfirmModal
        isOpen={deleteModalOpen}
        title="Excluir ou arquivar produto"
        message={`Confirma a remoção do produto "${productToDelete?.title}"? Produtos com histórico de venda serão arquivados automaticamente para preservar os pedidos.`}
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        onConfirm={handleDeleteConfirm}
        onCancel={() => { setDeleteModalOpen(false); setProductToDelete(null); }}
        isLoading={isDeleting}
      />
    </div>
  );
}
