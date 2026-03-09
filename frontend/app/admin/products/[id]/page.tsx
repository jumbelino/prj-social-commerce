"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter, useParams } from "next/navigation";

import { ErrorPanel } from "@/components/error-panel";
import { ApiRequestError, getProductById, type Product } from "@/lib/api";

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const [product, setProduct] = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [retryTrigger, setRetryTrigger] = useState(0);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function loadProduct() {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const data = await getProductById(productId);
        if (isActive) {
          setProduct(data);
          setTitle(data.title);
          setDescription(data.description || "");
          setActive(data.active);
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const response = await fetch(`/api/products/${productId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          description: description || null,
          active,
        }),
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
          <h1 className="text-2xl font-bold text-slate-900">Editar Produto</h1>
          <p className="text-sm text-[var(--color-muted)] mt-1">
            Atualize as informacoes do produto
          </p>
        </div>
        <button
          onClick={() => router.push("/admin/products")}
          className="text-sm text-[var(--color-muted)] hover:text-slate-700 transition-colors"
        >
          Voltar para lista
        </button>
      </div>

      {errorMessage && (
        <ErrorPanel title="Erro ao salvar" message={errorMessage} />
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6 space-y-4">
          <h2 className="text-lg font-semibold text-slate-900">Informacoes do Produto</h2>
          
          <div className="space-y-4">
            <div>
              <label htmlFor="title" className="block text-sm font-medium text-slate-700 mb-1">
                Titulo *
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-[var(--color-line)] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent"
              />
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-slate-700 mb-1">
                Descricao
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-[var(--color-line)] rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-transparent resize-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <input
                id="active"
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                className="w-4 h-4 text-[var(--color-accent)] border-[var(--color-line)] rounded focus:ring-[var(--color-accent)]"
              />
              <label htmlFor="active" className="text-sm text-slate-700">
                Produto ativo (visivel na loja)
              </label>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-[var(--color-accent)] text-[var(--color-accent-ink)] font-semibold rounded-lg hover:brightness-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? "Salvando..." : "Salvar alteracoes"}
            </button>
          </div>
        </section>
      </form>

      <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Imagens</h2>
        
        {product.images && product.images.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {product.images.map((image) => (
              <div
                key={image.id}
                className="relative aspect-square rounded-lg overflow-hidden border border-[var(--color-line)] bg-slate-100"
              >
                <Image
                  src={image.url}
                  alt={`Product image ${image.position + 1}`}
                  fill
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Este produto nao tem imagens.</p>
        )}
      </section>

      <section className="bg-[var(--color-card)] rounded-lg border border-[var(--color-line)] p-6">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Variacoes</h2>
        
        {product.variants && product.variants.length > 0 ? (
          <div className="space-y-3">
            {product.variants.map((variant) => (
              <div
                key={variant.id}
                className="flex items-center justify-between p-4 rounded-lg border border-[var(--color-line)] bg-[#fbf8f1]"
              >
                <div>
                  <p className="font-medium text-slate-900">{variant.sku}</p>
                  <p className="text-sm text-[var(--color-muted)]">
                    Preco: R$ {(variant.price_cents / 100).toFixed(2)} | Estoque: {variant.stock}
                  </p>
                  {variant.attributes_json && Object.keys(variant.attributes_json).length > 0 && (
                    <p className="text-xs text-[var(--color-muted)] mt-1">
                      {JSON.stringify(variant.attributes_json)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-[var(--color-muted)]">Este produto nao tem variacoes.</p>
        )}
      </section>
    </div>
  );
}
