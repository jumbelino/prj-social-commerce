import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";

import { authOptions } from "@/auth";
import { ErrorPanel } from "@/components/error-panel";
import { getAdminLoginRedirect } from "@/lib/auth-redirect";
import type { Product } from "@/lib/api";
import { ProductsClient } from "./client";

export const dynamic = "force-dynamic";

const API_BASE = process.env.INTERNAL_API_BASE_URL || "http://localhost:8000";

async function loadInitialProducts(accessToken: string): Promise<{
  products: Product[];
  error: string | null;
}> {
  try {
    const response = await fetch(`${API_BASE}/products?limit=20&offset=0`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type") ?? "";
    const payload = contentType.includes("application/json")
      ? ((await response.json()) as { detail?: string } | Product[])
      : await response.text();

    if (!response.ok) {
      if (typeof payload === "object" && payload !== null && "detail" in payload && typeof payload.detail === "string") {
        return { products: [], error: payload.detail };
      }
      if (typeof payload === "string" && payload.trim() !== "") {
        return { products: [], error: payload };
      }
      return { products: [], error: `Request failed with status ${response.status}.` };
    }

    return { products: Array.isArray(payload) ? payload : [], error: null };
  } catch {
    return { products: [], error: "Não foi possível carregar os produtos." };
  }
}

export default async function ProductsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session.roles?.includes("admin")) {
    redirect(getAdminLoginRedirect());
  }

  const { products: initialProducts, error } = await loadInitialProducts(session.accessToken);

  if (error) {
    return (
      <div className="space-y-4">
        <ErrorPanel title="Nao foi possivel carregar os produtos" message={error} />
      </div>
    );
  }

  return <ProductsClient initialProducts={initialProducts} />;
}
