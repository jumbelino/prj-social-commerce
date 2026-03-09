"use client";

import { ReactNode, useState } from "react";

import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { SessionExpiredHandler } from "@/components/admin/SessionExpiredHandler";

interface AdminLayoutClientProps {
  children: ReactNode;
  userName: string;
}

export function AdminLayoutClient({ children, userName }: AdminLayoutClientProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <SessionExpiredHandler />
      <div className="flex min-h-screen">
      <AdminSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col lg:pl-64">
        <AdminHeader userName={userName} onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 bg-[var(--color-bg)] p-4 lg:p-6">{children}</main>
      </div>
      </div>
    </>
  );
}
