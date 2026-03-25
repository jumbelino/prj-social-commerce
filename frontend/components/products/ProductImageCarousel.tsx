"use client";

import { useState, useCallback } from "react";
import Image from "next/image";

import type { ProductImage } from "@/lib/api";

export interface ProductImageCarouselProps {
  images: ProductImage[];
}

export function ProductImageCarousel({ images }: ProductImageCarouselProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

  const hasMultipleImages = images.length > 1;
  const hasNoImages = images.length === 0;

  const handlePrevious = useCallback(() => {
    if (hasNoImages) return;
    setSelectedIndex((prev) => (prev === 0 ? images.length - 1 : prev - 1));
  }, [images.length, hasNoImages]);

  const handleNext = useCallback(() => {
    if (hasNoImages) return;
    setSelectedIndex((prev) => (prev === images.length - 1 ? 0 : prev + 1));
  }, [images.length, hasNoImages]);

  const handleThumbnailClick = useCallback((index: number) => {
    setSelectedIndex(index);
  }, []);

  if (hasNoImages) {
    return (
      <div className="overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(16,26,47,0.96),rgba(10,18,33,0.96))] shadow-[0_20px_54px_rgba(0,0,0,0.24)]">
        <div className="relative aspect-[4/4.8] w-full overflow-hidden bg-[radial-gradient(circle,rgba(104,179,255,0.14),transparent_48%)]">
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
            <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em]">
              Sem imagem
            </div>
            <p className="text-sm">Este produto ainda nao recebeu fotos.</p>
          </div>
        </div>
      </div>
    );
  }

  const selectedImage = images[selectedIndex];

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-[28px] border border-[var(--color-line)] bg-[linear-gradient(180deg,rgba(16,26,47,0.96),rgba(10,18,33,0.96))] shadow-[0_20px_54px_rgba(0,0,0,0.24)]">
        <div className="relative aspect-[4/4.8] w-full overflow-hidden bg-[var(--color-surface-3)]">
          {selectedImage.url ? (
            <>
              <Image
                src={selectedImage.url}
                alt={`Imagem ${selectedIndex + 1} de ${images.length}`}
                fill
                className="object-cover"
                priority
              />
              <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#07111f]/84 via-[#07111f]/20 to-transparent" />
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-[var(--color-text-muted)]">
              <div className="rounded-full border border-[var(--color-line)] bg-[var(--color-surface-2)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.24em]">
                Sem imagem
              </div>
              <p className="text-sm">A foto principal ainda nao foi publicada.</p>
            </div>
          )}

          <div className="absolute left-4 top-4 rounded-full border border-[var(--color-line)] bg-[rgba(7,17,31,0.78)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--color-text-secondary)] backdrop-blur">
            Galeria
          </div>

          {hasMultipleImages && (
            <>
              <button
                type="button"
                onClick={handlePrevious}
                className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-line)] bg-[rgba(7,17,31,0.78)] text-[var(--color-text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition hover:border-[var(--color-line-strong)] hover:bg-[rgba(10,18,33,0.94)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                aria-label="Imagem anterior"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15.75 19.5L8.25 12l7.5-7.5"
                  />
                </svg>
              </button>

              <button
                type="button"
                onClick={handleNext}
                className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-[var(--color-line)] bg-[rgba(7,17,31,0.78)] text-[var(--color-text-primary)] shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition hover:border-[var(--color-line-strong)] hover:bg-[rgba(10,18,33,0.94)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
                aria-label="Proxima imagem"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                  stroke="currentColor"
                  className="h-5 w-5"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
              </button>
            </>
          )}

          {hasMultipleImages && (
            <div className="absolute bottom-4 right-4 rounded-full border border-[var(--color-line)] bg-[rgba(7,17,31,0.78)] px-3 py-1 text-xs text-[var(--color-text-primary)] backdrop-blur">
              {selectedIndex + 1} / {images.length}
            </div>
          )}
        </div>
      </div>

      {hasMultipleImages && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => handleThumbnailClick(index)}
              className={`relative h-20 w-20 flex-shrink-0 overflow-hidden rounded-2xl border transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-0 ${
                index === selectedIndex
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] shadow-[0_12px_28px_rgba(0,0,0,0.2)]"
                  : "border-[var(--color-line)] bg-[var(--color-surface-2)] opacity-75 hover:border-[var(--color-line-strong)] hover:opacity-100"
              }`}
              aria-label={`Ver imagem ${index + 1}`}
              aria-pressed={index === selectedIndex}
            >
              {image.url ? (
                <Image
                  src={image.url}
                  alt={`Thumbnail ${index + 1}`}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-[var(--color-surface-3)] text-[var(--color-text-muted)]">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.18em]">Fallback</span>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
