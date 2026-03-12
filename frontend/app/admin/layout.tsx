import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { AdminLayoutClient } from "@/components/admin/AdminLayoutClient";
import { getAdminLoginRedirect } from "@/lib/auth-redirect";

export const dynamic = "force-dynamic";

interface AdminLayoutProps {
  children: ReactNode;
}

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    redirect(getAdminLoginRedirect());
  }

  const userName = session.user?.email ?? session.user?.name ?? "admin";

  return <AdminLayoutClient userName={userName}>{children}</AdminLayoutClient>;
}
