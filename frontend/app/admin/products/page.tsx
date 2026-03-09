import { listAdminProducts } from "@/lib/api";
import { ProductsClient } from "./client";

export default async function ProductsPage() {
  const initialProducts = await listAdminProducts({ limit: 20, offset: 0 });

  return <ProductsClient initialProducts={initialProducts} />;
}
