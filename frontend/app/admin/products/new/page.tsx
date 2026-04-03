"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ProductForm } from "@/components/products/ProductForm";
import { type PendingImage } from "@/components/products/PendingImageUploader";
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

async function uploadImageToProduct(productId: string, file: File): Promise<void> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`/api/admin/products/${productId}/images/upload`, {
    method: "POST",
    body: formData,
    credentials: "include",
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.detail || "Failed to upload image");
  }
}

export default function NewProductPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [uploadProgress, setUploadProgress] = useState<string | null>(null);

  const handleSubmit = async (data: ProductCreatePayload | Partial<Product>) => {
    if (!("title" in data) || typeof data.title !== "string") {
      setError("Dados inválidos para criação de produto.");
      return;
    }

    const payload: ProductCreatePayload = {
      title: data.title,
      description: data.description,
      active: data.active ?? true,
      variants: data.variants as ProductCreatePayload["variants"],
      images: [],
    };

    setIsSubmitting(true);
    setError(null);

    try {
      const createdProduct = await createProductAsAdmin(payload);

      if (pendingImages.length > 0) {
        setUploadProgress(`Enviando ${pendingImages.length} imagem(ns)...`);
        
        let uploadedCount = 0;
        const errors: string[] = [];

        for (const pendingImage of pendingImages) {
          try {
            await uploadImageToProduct(createdProduct.id, pendingImage.file);
            uploadedCount++;
            setUploadProgress(`Enviando imagem ${uploadedCount}/${pendingImages.length}...`);
          } catch (uploadError) {
            errors.push(
              `Falha ao enviar imagem ${uploadedCount + 1}: ${uploadError instanceof Error ? uploadError.message : "Erro desconhecido"}`
            );
          }
        }

        if (errors.length > 0) {
          setError(`Produto criado, mas ${errors.length} imagem(ns) falharam: ${errors.join("; ")}`);
        }
      }

      router.push(`/admin/products/${createdProduct.id}`);
    } catch (err) {
      setError(messageFromError(err));
    } finally {
      setIsSubmitting(false);
      setUploadProgress(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-[var(--color-text)]">Novo Produto</h1>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {uploadProgress && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          {uploadProgress}
        </div>
      )}

      <section className="rounded-lg border border-[var(--color-line)] bg-[var(--color-card)] p-6">
        <ProductForm
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
          pendingImages={pendingImages}
          onPendingImagesChange={setPendingImages}
        />
      </section>
    </div>
  );
}
