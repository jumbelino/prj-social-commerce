import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { getAdminLoginRedirect } from "@/lib/auth-redirect";
import { listAdminProducts } from "@/lib/api";
import { ProductsClient } from "./client";

export const dynamic = "force-dynamic";

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session.roles?.includes("admin")) {
    redirect(getAdminLoginRedirect());
  }

  const initialProducts = await listAdminProducts({ limit: 20, offset: 0 });

  return <ProductsClient initialProducts={initialProducts} />;
}
