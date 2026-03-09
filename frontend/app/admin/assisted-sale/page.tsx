import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { AssistedSaleClient } from "./client";
import { getAdminLoginRedirect } from "@/lib/auth-redirect";

export default async function AssistedSalePage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session.roles?.includes("admin")) {
    redirect(getAdminLoginRedirect());
  }

  return <AssistedSaleClient />;
}
