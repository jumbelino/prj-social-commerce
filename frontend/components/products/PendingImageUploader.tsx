"use client";

import { useCallback, useRef, useState, useEffect } from "react";

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

export interface PendingImage {
  id: string;
  file: File;
  previewUrl: string;
}

interface SortableImageProps {
  image: PendingImage;
  index: number;
  onRemove: (id: string) => void;
}

function SortableImage({ image, index, onRemove }: SortableImageProps) {
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
        src={image.previewUrl}
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
        className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-500 text-white transition hover:bg-red-600"
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

export interface PendingImageUploaderProps {
  images: PendingImage[];
  onImagesChange: (images: PendingImage[]) => void;
}

export function PendingImageUploader({
  images,
  onImagesChange,
}: PendingImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const MAX_IMAGES = 10;

  useEffect(() => {
    return () => {
      images.forEach((img) => URL.revokeObjectURL(img.previewUrl));
    };
  }, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;

      if (!over || active.id === over.id) {
        return;
      }

      const oldIndex = images.findIndex((img) => img.id === active.id);
      const newIndex = images.findIndex((img) => img.id === over.id);

      const newImages = arrayMove(images, oldIndex, newIndex);
      onImagesChange(newImages);
    },
    [images, onImagesChange]
  );

  const handleUploadClick = () => {
    if (images.length >= MAX_IMAGES) {
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) {
      return;
    }

    const remainingSlots = MAX_IMAGES - images.length;
    const filesToAdd = files.slice(0, remainingSlots);

    const newImages: PendingImage[] = filesToAdd.map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    onImagesChange([...images, ...newImages]);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleRemove = (id: string) => {
    const imageToRemove = images.find((img) => img.id === id);
    if (imageToRemove) {
      URL.revokeObjectURL(imageToRemove.previewUrl);
    }
    onImagesChange(images.filter((img) => img.id !== id));
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

      <p className="text-sm text-[var(--color-muted)]">
        Selecione as imagens do produto. Após criar o produto, as imagens serão enviadas automaticamente.
      </p>

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
                onRemove={handleRemove}
              />
            ))}

            {!isMaxReached && (
              <button
                type="button"
                onClick={handleUploadClick}
                className="aspect-square flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-[var(--color-line)] bg-slate-50 text-[var(--color-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
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
        multiple
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
