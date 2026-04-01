"use client";

import { useState, useCallback } from "react";

import type { Product, ProductVariant, ProductCreatePayload, ProductImageCreatePayload, ProductVariantCreatePayload } from "@/lib/api";
import { PendingImageUploader, type PendingImage } from "./PendingImageUploader";

export interface ProductFormProps {
  initialData?: Product;
  onSubmit: (data: ProductCreatePayload | Partial<Product>) => Promise<void>;
  isSubmitting?: boolean;
  pendingImages?: PendingImage[];
  onPendingImagesChange?: (images: PendingImage[]) => void;
}

type VariantFormData = {
  id?: string;
  sku: string;
  priceCents: string;
  stock: string;
  size: string;
  color: string;
  weightKg: string;
  widthCm: string;
  heightCm: string;
  lengthCm: string;
};

const EMPTY_VARIANT: VariantFormData = {
  sku: "",
  priceCents: "",
  stock: "",
  size: "",
  color: "",
  weightKg: "",
  widthCm: "",
  heightCm: "",
  lengthCm: "",
};

type FormErrors = Record<string, string>;

export function ProductForm({ initialData, onSubmit, isSubmitting = false, pendingImages = [], onPendingImagesChange }: ProductFormProps) {
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [active, setActive] = useState(initialData?.active ?? true);
  const [variants, setVariants] = useState<VariantFormData[]>(
    initialData?.variants && initialData.variants.length > 0
      ? initialData.variants.map((v) => {
          const attrs = v.attributes_json || {};
          return {
            id: v.id,
            sku: v.sku,
            priceCents: String(v.price_cents),
            stock: String(v.stock),
            size: typeof attrs.size === "string" ? attrs.size : "",
            color: typeof attrs.color === "string" ? attrs.color : "",
            weightKg: v.weight_kg !== null && v.weight_kg !== undefined ? String(v.weight_kg) : "",
            widthCm: v.width_cm !== null && v.width_cm !== undefined ? String(v.width_cm) : "",
            heightCm: v.height_cm !== null && v.height_cm !== undefined ? String(v.height_cm) : "",
            lengthCm: v.length_cm !== null && v.length_cm !== undefined ? String(v.length_cm) : "",
          };
        })
      : [{ ...EMPTY_VARIANT }]
  );
  const [errors, setErrors] = useState<FormErrors>({});

  const isEditMode = !!initialData;

  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {};

    if (!title.trim()) {
      newErrors.title = "Título é obrigatório";
    }

    for (let i = 0; i < variants.length; i++) {
      const variant = variants[i];
      if (!variant.sku.trim()) {
        newErrors[`variants.${i}.sku`] = "SKU é obrigatório";
      }
      const priceCents = Number(variant.priceCents);
      if (isNaN(priceCents) || priceCents < 0) {
        newErrors[`variants.${i}.priceCents`] = "Preço deve ser um número não negativo";
      }
      const stock = Number(variant.stock);
      if (isNaN(stock) || stock < 0) {
        newErrors[`variants.${i}.stock`] = "Estoque deve ser um número não negativo";
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [title, variants]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) {
      return;
    }

    const processedVariants: ProductVariantCreatePayload[] = variants.map((v) => {
      const attributesJson: Record<string, string> = {};
      if (v.size.trim()) attributesJson.size = v.size.trim();
      if (v.color.trim()) attributesJson.color = v.color.trim();

      const variantData: ProductVariantCreatePayload = {
        sku: v.sku.trim(),
        price_cents: Number(v.priceCents),
        stock: Number(v.stock),
        attributes_json: attributesJson,
      };

      if (v.weightKg.trim()) variantData.weight_kg = Number(v.weightKg);
      if (v.widthCm.trim()) variantData.width_cm = Number(v.widthCm);
      if (v.heightCm.trim()) variantData.height_cm = Number(v.heightCm);
      if (v.lengthCm.trim()) variantData.length_cm = Number(v.lengthCm);

      return variantData;
    });

    if (isEditMode) {
      const updateData: Partial<Product> = {};
      if (title.trim()) updateData.title = title.trim();
      if (description.trim()) updateData.description = description.trim();
      else if (description === "") updateData.description = null;
      updateData.active = active;
      if (processedVariants.length > 0) {
        updateData.variants = processedVariants.map((v, idx) => ({
          id: variants[idx]?.id,
          ...v,
        })) as ProductVariant[];
      }
      await onSubmit(updateData);
    } else {
      const createData: ProductCreatePayload = {
        title: title.trim(),
        description: description.trim() || undefined,
        active,
        variants: processedVariants,
        images: [] as ProductImageCreatePayload[],
      };
      await onSubmit(createData);
    }
  };

  const updateVariant = (index: number, field: keyof VariantFormData, value: string) => {
    setVariants((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      return updated;
    });
    if (errors[`variants.${index}.${field}`]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[`variants.${index}.${field}`];
        return newErrors;
      });
    }
  };

  const addVariant = () => {
    setVariants((prev) => [...prev, { ...EMPTY_VARIANT }]);
  };

  const removeVariant = (index: number) => {
    if (variants.length > 1) {
      setVariants((prev) => prev.filter((_, i) => i !== index));
    }
  };

  const isValid =
    title.trim().length > 0 &&
    variants.every(
      (v) =>
        v.sku.trim().length > 0 &&
        !isNaN(Number(v.priceCents)) &&
        Number(v.priceCents) >= 0 &&
        !isNaN(Number(v.stock)) &&
        Number(v.stock) >= 0
    );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-semibold text-[var(--color-label)]">
          Título <span className="text-red-500">*</span>
        </label>
        <input
          id="title"
          type="text"
          required
          minLength={1}
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (errors.title) {
              setErrors((prev) => {
                const newErrors = { ...prev };
                delete newErrors.title;
                return newErrors;
              });
            }
          }}
          placeholder="Ex: Camiseta Social Commerce"
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
        {errors.title && <p className="mt-1 text-xs text-red-500">{errors.title}</p>}
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-semibold text-[var(--color-label)]">
          Descrição
        </label>
        <textarea
          id="description"
          rows={3}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição opcional do produto"
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        />
      </div>

      <div>
        <label htmlFor="status" className="block text-sm font-semibold text-[var(--color-label)]">
          Status
        </label>
        <select
          id="status"
          value={active ? "active" : "inactive"}
          onChange={(e) => setActive(e.target.value === "active")}
          className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
        >
          <option value="active" className="bg-[var(--color-input-bg)]">Ativo</option>
          <option value="inactive" className="bg-[var(--color-input-bg)]">Inativo</option>
        </select>
      </div>

      {!isEditMode && onPendingImagesChange && (
        <div className="border-t border-[var(--color-line)] pt-4">
          <PendingImageUploader
            images={pendingImages}
            onImagesChange={onPendingImagesChange}
          />
        </div>
      )}

      <div className="border-t border-[var(--color-line)] pt-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold text-[var(--color-text)]">Variações</h3>
          <button
            type="button"
            onClick={addVariant}
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            + Adicionar variação
          </button>
        </div>
        
        {variants.map((variant, index) => (
          <div key={index} className="mb-4 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-2,#f8fafc)] p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-[var(--color-muted)]">Variação {index + 1}</span>
              {variants.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeVariant(index)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remover
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label
                  htmlFor={`variants.${index}.sku`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  SKU <span className="text-red-500">*</span>
                </label>
                <input
                  id={`variants.${index}.sku`}
                  type="text"
                  required
                  value={variant.sku}
                  onChange={(e) => updateVariant(index, "sku", e.target.value)}
                  placeholder="Ex: TEE-MVP-001"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
                {errors[`variants.${index}.sku`] && (
                  <p className="mt-1 text-xs text-red-500">{errors[`variants.${index}.sku`]}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.priceCents`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Preço (centavos) <span className="text-red-500">*</span>
                </label>
                <input
                  id={`variants.${index}.priceCents`}
                  type="number"
                  required
                  min={0}
                  value={variant.priceCents}
                  onChange={(e) => updateVariant(index, "priceCents", e.target.value)}
                  placeholder="Ex: 5900"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
                {errors[`variants.${index}.priceCents`] && (
                  <p className="mt-1 text-xs text-red-500">{errors[`variants.${index}.priceCents`]}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.stock`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Estoque <span className="text-red-500">*</span>
                </label>
                <input
                  id={`variants.${index}.stock`}
                  type="number"
                  required
                  min={0}
                  value={variant.stock}
                  onChange={(e) => updateVariant(index, "stock", e.target.value)}
                  placeholder="Ex: 10"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
                {errors[`variants.${index}.stock`] && (
                  <p className="mt-1 text-xs text-red-500">{errors[`variants.${index}.stock`]}</p>
                )}
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.size`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Tamanho
                </label>
                <input
                  id={`variants.${index}.size`}
                  type="text"
                  value={variant.size}
                  onChange={(e) => updateVariant(index, "size", e.target.value)}
                  placeholder="Ex: M, G, GG"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.color`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Cor
                </label>
                <input
                  id={`variants.${index}.color`}
                  type="text"
                  value={variant.color}
                  onChange={(e) => updateVariant(index, "color", e.target.value)}
                  placeholder="Ex: Branco, Preto, Azul"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.weightKg`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Peso (kg)
                </label>
                <input
                  id={`variants.${index}.weightKg`}
                  type="number"
                  step="0.001"
                  min="0.001"
                  required
                  value={variant.weightKg}
                  onChange={(e) => updateVariant(index, "weightKg", e.target.value)}
                  placeholder="Ex: 0.5"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.widthCm`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Largura (cm)
                </label>
                <input
                  id={`variants.${index}.widthCm`}
                  type="number"
                  min="1"
                  required
                  value={variant.widthCm}
                  onChange={(e) => updateVariant(index, "widthCm", e.target.value)}
                  placeholder="Ex: 20"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.heightCm`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Altura (cm)
                </label>
                <input
                  id={`variants.${index}.heightCm`}
                  type="number"
                  min="1"
                  required
                  value={variant.heightCm}
                  onChange={(e) => updateVariant(index, "heightCm", e.target.value)}
                  placeholder="Ex: 30"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>

              <div>
                <label
                  htmlFor={`variants.${index}.lengthCm`}
                  className="block text-sm font-semibold text-[var(--color-label)]"
                >
                  Comprimento (cm)
                </label>
                <input
                  id={`variants.${index}.lengthCm`}
                  type="number"
                  min="1"
                  required
                  value={variant.lengthCm}
                  onChange={(e) => updateVariant(index, "lengthCm", e.target.value)}
                  placeholder="Ex: 40"
                  className="mt-1 w-full rounded-lg border border-[var(--color-line)] bg-[var(--color-input-bg)] text-[var(--color-text)] px-3 py-2 text-sm transition focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={!isValid || isSubmitting}
        className="rounded-lg bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-[var(--color-accent-ink)] transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-55"
      >
        {isSubmitting
          ? isEditMode
            ? "Salvando..."
            : "Criando..."
          : isEditMode
            ? "Salvar alterações"
            : "Criar produto"}
      </button>
    </form>
  );
}
