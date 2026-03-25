import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { ErrorPanel } from "@/components/error-panel";
import { getAdminLoginRedirect } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

const API_BASE = process.env.INTERNAL_API_BASE_URL || "http://localhost:8000";

type CustomerOrder = {
  id: string;
  status: string;
  total_cents: number;
  created_at: string;
  items: Array<unknown>;
};

type CustomerWithOrders = {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  total_orders: number;
  orders: CustomerOrder[];
};

function formatPrice(cents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(cents / 100);
}

function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateString));
}

function formatPhone(phone: string | null): string {
  if (!phone) return "-";
  const cleaned = phone.replace(/\D/g, "");
  if (cleaned.length === 11) {
    return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
}

function getStatusLabel(status: string): string {
  const statusMap: Record<string, string> = {
    pending: "Pendente",
    paid: "Pago",
    processing: "Processando",
    shipped: "Enviado",
    delivered: "Entregue",
    cancelled: "Cancelado",
    refunded: "Reembolsado",
  };
  return statusMap[status] || status;
}

function getStatusColor(status: string): string {
  const colorMap: Record<string, string> = {
    pending: "bg-yellow-100 text-yellow-800",
    paid: "bg-green-100 text-green-800",
    processing: "bg-blue-100 text-blue-800",
    shipped: "bg-purple-100 text-purple-800",
    delivered: "bg-emerald-100 text-emerald-800",
    cancelled: "bg-red-100 text-red-800",
    refunded: "bg-gray-100 text-gray-800",
  };
  return colorMap[status] || "bg-gray-100 text-gray-800";
}

async function loadCustomer(customerId: string, accessToken: string): Promise<{ customer: CustomerWithOrders | null; error: string | null }> {
  try {
    const response = await fetch(`${API_BASE}/admin/customers/${customerId}`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const payload = (await response.json()) as { detail?: string } | CustomerWithOrders;
    if (!response.ok) {
      if (typeof payload === "object" && payload && "detail" in payload && typeof payload.detail === "string") {
        return { customer: null, error: payload.detail };
      }
      return { customer: null, error: `Request failed with status ${response.status}.` };
    }

    return { customer: payload as CustomerWithOrders, error: null };
  } catch {
    return { customer: null, error: "Failed to load customer." };
  }
}

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session.roles?.includes("admin")) {
    redirect(getAdminLoginRedirect());
  }

  const { customer, error } = await loadCustomer(id, session.accessToken);

  if (error || !customer) {
    return (
      <div className="space-y-4">
        <ErrorPanel title="Cliente nao encontrado" message={error ?? "O cliente solicitado nao existe."} />
        <Link href="/admin/customers" className="text-sm text-[var(--color-accent)] hover:underline">
          Voltar para lista de clientes
        </Link>
      </div>
    );
  }

  const totalSpent = customer.orders.reduce((sum, order) => sum + order.total_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Cliente: {customer.name || "-"}</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Detalhes e historico de pedidos
          </p>
        </div>
        <Link
          href="/admin/customers"
          className="text-sm text-[var(--color-muted)] hover:text-slate-700 transition-colors"
        >
          Voltar para lista
        </Link>
      </div>

      <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6 space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">Informacoes</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-[var(--color-muted)]">Email</p>
            <p className="text-slate-900">{customer.email || "-"}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-muted)]">Telefone</p>
            <p className="text-slate-900">{formatPhone(customer.phone)}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-muted)]">Total de Pedidos</p>
            <p className="text-slate-900">{customer.total_orders}</p>
          </div>
          <div>
            <p className="text-sm text-[var(--color-muted)]">Total Gasto</p>
            <p className="text-slate-900 font-semibold">{formatPrice(totalSpent)}</p>
          </div>
        </div>
      </section>

      <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Historico de Pedidos</h2>
        
        {customer.orders && customer.orders.length > 0 ? (
          <div className="space-y-3">
            {customer.orders.map((order) => (
              <Link
                key={order.id}
                href={`/admin/orders/${order.id}`}
                className="block p-4 rounded-lg border border-[var(--color-line)] hover:border-[var(--color-accent)] transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-slate-900">#{order.id.slice(0, 8)}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                        {getStatusLabel(order.status)}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-muted)] mt-1">
                      {formatDate(order.created_at)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-slate-900">{formatPrice(order.total_cents)}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {order.items.length} item(s)
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Este cliente nao tem pedidos.</p>
        )}
      </section>
    </div>
  );
}
