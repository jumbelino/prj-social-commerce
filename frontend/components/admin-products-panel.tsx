"use client";

import { useEffect, useState } from "react";

import { ErrorPanel } from "@/components/error-panel";
import {
  ApiRequestError,
  createProductAsAdmin,
  listAdminProducts,
  type Product,
  type ProductCreatePayload,
} from "@/lib/api";

type ProductFormState = {
  title: string;
  description: string;
  sku: string;
  priceCents: string;
  stock: string;
};

type SubmitEventLike = {
  preventDefault: () => void;
};

const INITIAL_FORM: ProductFormState = {
  title: "",
  description: "",
  sku: "",
  priceCents: "",
  stock: "",
};

function messageFromError(error: unknown): string {
  if (error instanceof ApiRequestError) {
    return error.message;
  }
  return "Unexpected request failure.";
}

export function AdminProductsPanel() {
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(INITIAL_FORM);

  useEffect(() => {
    let isActive = true;

    async function run() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const data = await listAdminProducts();
        if (isActive) {
          setProducts(data);
        }
      } catch (error) {
        if (isActive) {
          setLoadError(messageFromError(error));
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    run();

    return () => {
      isActive = false;
    };
  }, []);

  async function handleSubmit(event: SubmitEventLike) {
    event.preventDefault();
    if (isSaving) {
      return;
    }

    const priceCents = Number(form.priceCents);
    const stock = Number(form.stock);
    if (!Number.isInteger(priceCents) || priceCents < 0) {
      setSaveError("Price (cents) must be a non-negative integer.");
      return;
    }
    if (!Number.isInteger(stock) || stock < 0) {
      setSaveError("Stock must be a non-negative integer.");
      return;
    }

    const payload: ProductCreatePayload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      active: true,
      variants: [
        {
          sku: form.sku.trim(),
          price_cents: priceCents,
          attributes_json: {},
          stock,
        },
      ],
      images: [],
    };

    setIsSaving(true);
    setSaveError(null);

    try {
      const created = await createProductAsAdmin(payload);
      setProducts((current) => [created, ...current]);
      setForm(INITIAL_FORM);
    } catch (error) {
      setSaveError(messageFromError(error));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <article className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
        <h2 className="font-display text-3xl text-slate-900">Products</h2>

        {loadError ? <ErrorPanel title="Could not load products" message={loadError} /> : null}

        {isLoading ? (
          <div className="mt-4 rounded-xl border border-dashed border-[var(--color-line)] bg-white/70 px-4 py-8 text-center text-sm text-[var(--color-muted)]">
            Loading products...
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {products.map((product) => (
              <li
                key={product.id}
                className="rounded-xl border border-[var(--color-line)] bg-[#fbf8f1] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-semibold text-slate-900">{product.title}</p>
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    {product.active ? "active" : "inactive"}
                  </span>
                </div>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {product.description ?? "No description"}
                </p>
                <p className="mt-2 text-xs text-slate-700">
                  Variants: {product.variants.length} | Images: {product.images.length}
                </p>
              </li>
            ))}
            {products.length === 0 ? (
              <li className="rounded-xl border border-dashed border-[var(--color-line)] bg-white/75 px-4 py-6 text-sm text-[var(--color-muted)]">
                No products returned by the backend.
              </li>
            ) : null}
          </ul>
        )}
      </article>

      <article className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-card)] p-5 shadow-[0_10px_26px_rgba(18,30,40,0.07)]">
        <h2 className="font-display text-3xl text-slate-900">Create product</h2>

        {saveError ? <div className="mt-3"><ErrorPanel title="Create failed" message={saveError} /></div> : null}

        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
          <label className="block text-sm font-semibold text-slate-700" htmlFor="title">
            Title
            <input
              id="title"
              required
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.title}
              onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
              placeholder="Coffee Beans"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700" htmlFor="description">
            Description
            <textarea
              id="description"
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Freshly roasted beans"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700" htmlFor="sku">
            SKU
            <input
              id="sku"
              required
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.sku}
              onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
              placeholder="COF-500G"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700" htmlFor="priceCents">
            Price (cents)
            <input
              id="priceCents"
              required
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.priceCents}
              onChange={(event) => setForm((current) => ({ ...current, priceCents: event.target.value }))}
              placeholder="1299"
            />
          </label>

          <label className="block text-sm font-semibold text-slate-700" htmlFor="stock">
            Stock
            <input
              id="stock"
              required
              type="number"
              min={0}
              className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-white px-3 py-2 text-sm"
              value={form.stock}
              onChange={(event) => setForm((current) => ({ ...current, stock: event.target.value }))}
              placeholder="12"
            />
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
          >
            {isSaving ? "Saving..." : "Create product"}
          </button>
        </form>
      </article>
    </section>
  );
}
