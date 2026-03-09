"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Produtos", href: "/admin/products", icon: "📦" },
  { label: "Clientes", href: "/admin/customers", icon: "👥" },
  { label: "Pedidos", href: "/admin/orders", icon: "📋" },
  { label: "Venda Assistida", href: "/admin/assisted-sale", icon: "💰" },
];

export function AdminSidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();

  const isActive = (href: string) => {
    if (href === "/admin") {
      return pathname === "/admin";
    }
    return pathname.startsWith(href);
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 transform bg-[var(--color-card)] border-r border-[var(--color-line)] transition-transform duration-200 lg:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-16 items-center border-b border-[var(--color-line)] px-5">
          <span className="font-display text-xl font-semibold text-[var(--color-text)]">
            Admin
          </span>
        </div>

        <nav className="p-4">
          <ul className="space-y-1">
            {navItems.map((item) => {
              const active = isActive(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                      active
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-ink)]"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-bg-soft)] hover:text-[var(--color-text)]"
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>
    </>
  );
}
