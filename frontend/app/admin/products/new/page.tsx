"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProductForm } from "@/components/products/ProductForm";
import {
  ApiRequestError,
  createProductAsAdmin,
  type Product,
  type ProductCreatePayload,
} from "@/lib/api";

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return "Erro inesperado ao criar produto.";
}

export default function NewProductPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (data: ProductCreatePayload | Partial<Product>) => {
    // Type guard: ensure we have valid creation data
    if (!("title" in data) || typeof data.title !== "string") {
      setError("Dados inválidos para criação de produto.");
      return;
    }

    const payload: ProductCreatePayload = {
      title: data.title,
      description: data.description,
      active: data.active ?? true,
      variants: data.variants as ProductCreatePayload["variants"],
      images: data.images ?? [],
    };

    setIsSubmitting(true);
    setError(null);

    try {
      await createProductAsAdmin(payload);
      router.push("/admin/products");
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-slate-900">Novo Produto</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] p-6">
        <ProductForm onSubmit={handleSubmit} isSubmitting={isSubmitting} />
      </section>

      <p className="text-sm text-[var(--color-muted)]">
        Após criar o produto, você poderá adicionar imagens na página de edição.
      </p>
    </div>
  );
}
