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
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-slate-100">
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-16 w-16"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
            />
          </svg>
        </div>
      </div>
    );
  }

  const selectedImage = images[selectedIndex];

  return (
    <div className="space-y-4">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-slate-100">
        {selectedImage.url ? (
          <Image
            src={selectedImage.url}
            alt={`Imagem ${selectedIndex + 1} de ${images.length}`}
            fill
            className="object-cover"
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-slate-400">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="h-16 w-16"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
              />
            </svg>
          </div>
        )}

        {hasMultipleImages && (
          <>
            <button
              type="button"
              onClick={handlePrevious}
              className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-0 text-slate-700 shadow-md transition hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
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
              className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 p-0 text-slate-700 shadow-md transition hover:bg-white hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
              aria-label="Próxima imagem"
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
          <div className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1 text-xs text-white">
            {selectedIndex + 1} / {images.length}
          </div>
        )}
      </div>

      {hasMultipleImages && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => handleThumbnailClick(index)}
              className={`relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:ring-offset-2 ${
                index === selectedIndex
                  ? "border-[var(--color-accent)]"
                  : "border-transparent opacity-70 hover:opacity-100"
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
                <div className="flex h-full w-full items-center justify-center bg-slate-200 text-slate-400">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="h-6 w-6"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75a1.5 1.5h16.5.5-1 0 001.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z"
                    />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
