"use client";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { ProductImagesManager } from "@/components/products/ProductImagesManager";
import { ProductForm } from "@/components/products/ProductForm";
import {
  ApiRequestError,
  getAdminProductById,
  type Product,
  type ProductImage,
  type ProductCreatePayload,
} from "@/lib/api";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  useEffect(() => {
    let isActive = true;

    async function loadProduct() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getAdminProductById(productId);
        if (isActive) {
          setProduct(data);
        }
      } catch (error) {
        const message =
          error instanceof ApiRequestError ? error.message : "Failed to load product";
        if (isActive) {
          setErrorMessage(message);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    if (productId) {
      loadProduct();
    }

    return () => {
      isActive = false;
    };
  }, [productId, retryTrigger]);

  const handleSubmit = async (data: ProductCreatePayload | Partial<Product>) => {
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/admin/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to update product");
      }

      router.push("/admin/products");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update product";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--color-accent)] mx-auto mb-4"></div>
          <p className="text-[var(--color-muted)]">Carregando produto...</p>
        </div>
      </div>
    );
  }

  if (errorMessage && !product) {
    return (
      <div className="space-y-4">
        <ErrorPanel title="Produto nao encontrado" message={errorMessage} />
        <div className="flex gap-3">
          <button
            onClick={() => setRetryTrigger((t) => t + 1)}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-ink)] hover:opacity-90"
          >
            Tentar novamente
          </button>
          <button
            onClick={() => router.push("/admin/products")}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Voltar para lista de produtos
          </button>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="space-y-4">
        <ErrorPanel title="Produto nao encontrado" message="O produto solicitado nao existe." />
        <button
          onClick={() => router.push("/admin/products")}
          className="text-sm text-[var(--color-accent)] hover:underline"
        >
          Voltar para lista de produtos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Editar Produto</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Atualize as informacoes do produto e de suas variantes
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/products")}
          className="text-sm text-[var(--color-muted)] hover:text-[var(--color-text)] transition-colors"
        >
          Voltar para lista
        </button>
      </div>

      {errorMessage && (
        <ErrorPanel title="Erro ao salvar" message={errorMessage} />
      )}

      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-amber-500" aria-hidden="true">
          <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
        </svg>
        <span>
          <strong>Imagens são salvas automaticamente</strong> ao serem adicionadas. As demais alterações requerem clicar em <strong>Salvar</strong>.
        </span>
      </div>

      <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
        <ProductForm
          initialData={product}
          onSubmit={handleSubmit}
          isSubmitting={isSubmitting}
        />
      </section>

      <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
        <ProductImagesManager
          productId={product.id}
          images={product.images}
          onImagesChange={(newImages: ProductImage[]) => {
            setProduct((prev) => (prev ? { ...prev, images: newImages } : null));
          }}
        />
      </section>
    </div>
  );
}
