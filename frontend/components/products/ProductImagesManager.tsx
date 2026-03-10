"use client";

import { useCallback, useRef, useState } from "react";

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import ConfirmModal from "@/components/admin/ConfirmModal";
import type { ProductImage } from "@/lib/api";

export interface ProductImagesManagerProps {
  productId: string;
  images: ProductImage[];
  onImagesChange: (images: ProductImage[]) => void;
}

interface SortableImageProps {
  image: ProductImage;
  index: number;
  onRemove: (imageId: number) => void;
  isRemoving: boolean;
}

function SortableImage({ image, index, onRemove, isRemoving }: SortableImageProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: image.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isFirst = index === 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative aspect-square rounded-lg overflow-hidden border border-[var(--color-line)] bg-slate-50 ${
        isDragging ? "opacity-50 shadow-lg" : ""
      }`}
      {...attributes}
      {...listeners}
    >
      <img
        src={image.url}
        alt={`Imagem ${index + 1}`}
        className="h-full w-full object-cover"
        draggable={false}
      />
      {isFirst && (
        <span className="absolute left-2 top-2 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-semibold text-[var(--color-accent-ink)]">
          Principal
        </span>
      )}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove(image.id);
        }}
        disabled={isRemoving}
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-4 w-4"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}

export function ProductImagesManager({
  productId,
  images,
  onImagesChange,
}: ProductImagesManagerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [removingImageId, setRemovingImageId] = useState<number | null>(null);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const MAX_IMAGES = 10;

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);

      const newImages = arrayMove(images, oldIndex, newIndex).map((img, idx) => ({
        ...img,
        position: idx,
      }));

      onImagesChange(newImages);

      try {
        await fetch(`/api/admin/products/${productId}/images/reorder`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            image_ids_in_order: newImages.map((img) => img.id),
          }),
        });
      } catch (error) {
        console.error("Failed to persist reorder:", error);
      }
    },
    [images, onImagesChange, productId]
  );

  const handleUploadClick = () => {
    if (images.length >= MAX_IMAGES) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch(
        `/api/admin/products/${productId}/images/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to upload image");
      }

      const newImage: ProductImage = await response.json();

      const updatedImages = [...images, { ...newImage, position: images.length }];
      onImagesChange(updatedImages);
    } catch (error) {
      console.error("Upload failed:", error);
      alert(error instanceof Error ? error.message : "Erro ao carregar imagem");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveClick = (imageId: number) => {
    setRemovingImageId(imageId);
    setShowRemoveConfirm(true);
  };

  const handleConfirmRemove = async () => {
    if (removingImageId === null) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(
        `/api/admin/products/${productId}/images/${removingImageId}`,
        {
          method: "DELETE",
        }
      );

      if (!response.ok && response.status !== 204) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to delete image");
      }

      const remainingImages = images
        .filter((img) => img.id !== removingImageId)
        .map((img, idx) => ({ ...img, position: idx }));

      onImagesChange(remainingImages);
    } catch (error) {
      console.error("Delete failed:", error);
      alert(error instanceof Error ? error.message : "Erro ao remover imagem");
    } finally {
      setIsDeleting(false);
      setShowRemoveConfirm(false);
      setRemovingImageId(null);
    }
  };

  const handleCancelRemove = () => {
    setShowRemoveConfirm(false);
    setRemovingImageId(null);
  };

  const isMaxReached = images.length >= MAX_IMAGES;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display text-lg font-semibold text-slate-900">
          Imagens do Produto
        </h3>
        <span className="text-sm text-[var(--color-muted)]">
          {images.length} / {MAX_IMAGES}
        </span>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={images.map((img) => img.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {images.map((image, index) => (
              <SortableImage
                key={image.id}
                image={image}
                index={index}
                onRemove={handleRemoveClick}
                isRemoving={removingImageId === image.id}
              />
            ))}

            {!isMaxReached && (
              <button
                type="button"
                onClick={handleUploadClick}
                disabled={isUploading}
                className="aspect-square flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-line)] bg-slate-50 text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isUploading ? (
                  <>
                    <svg
                      className="h-8 w-8 animate-spin text-[var(--color-accent)]"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    <span className="mt-2 text-xs">Carregando...</span>
                  </>
                ) : (
                  <>
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      className="h-8 w-8"
                    >
                      <path
                        fillRule="evenodd"
                        d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H4.5a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="mt-2 text-xs">Adicionar</span>
                  </>
                )}
              </button>
            )}
          </div>
        </SortableContext>
      </DndContext>

      {isMaxReached && (
        <p className="text-sm text-amber-600">
          Limite máximo de {MAX_IMAGES} imagens atingido. Remova uma imagem para
          adicionar outra.
        </p>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      <ConfirmModal
        isOpen={showRemoveConfirm}
        title="Remover Imagem"
        message="Tem certeza que deseja remover esta imagem? Esta ação não pode ser desfeita."
        confirmLabel="Remover"
        cancelLabel="Cancelar"
        onConfirm={handleConfirmRemove}
        onCancel={handleCancelRemove}
        isLoading={isDeleting}
      />
    </div>
  );
}
