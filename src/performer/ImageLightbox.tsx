import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { PerformerImageCard } from "../api/queries";

interface ImageLightboxProps {
    images: PerformerImageCard[];
    startIndex: number;
    onClose: () => void;
}

// Full-screen image viewer. Arrow keys + on-screen prev/next buttons
// navigate; Esc closes. Portalled to <body> so it sits above the profile
// modal (z:90) and any sheets (z:80). Z:110.
export function ImageLightbox({
    images,
    startIndex,
    onClose,
}: ImageLightboxProps) {
    const [index, setIndex] = useState(startIndex);
    const current = images[index];

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            else if (e.key === "ArrowLeft") goPrev();
            else if (e.key === "ArrowRight") goNext();
        };
        document.addEventListener("keydown", handler);
        return () => document.removeEventListener("keydown", handler);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [images.length]);

    const goPrev = () => setIndex((i) => (i > 0 ? i - 1 : i));
    const goNext = () =>
        setIndex((i) => (i < images.length - 1 ? i + 1 : i));

    if (!current) return null;

    const src = current.paths.image || current.paths.thumbnail || "";
    const canPrev = index > 0;
    const canNext = index < images.length - 1;

    return createPortal(
        <div
            className="binge-lightbox-root"
            role="dialog"
            aria-label="Image viewer"
        >
            <div className="binge-lightbox-backdrop" onClick={onClose} />
            <button
                type="button"
                className="binge-lightbox-close"
                onClick={onClose}
                aria-label="Close"
            >
                ×
            </button>
            <div className="binge-lightbox-stage">
                {src && (
                    <img
                        key={current.id}
                        src={src}
                        alt={current.title || ""}
                        className="binge-lightbox-image"
                    />
                )}
            </div>
            {canPrev && (
                <button
                    type="button"
                    className="binge-lightbox-nav binge-lightbox-prev"
                    onClick={goPrev}
                    aria-label="Previous image"
                >
                    <ChevronLeft />
                </button>
            )}
            {canNext && (
                <button
                    type="button"
                    className="binge-lightbox-nav binge-lightbox-next"
                    onClick={goNext}
                    aria-label="Next image"
                >
                    <ChevronRight />
                </button>
            )}
            <div className="binge-lightbox-counter" aria-hidden="true">
                {index + 1} / {images.length}
            </div>
        </div>,
        document.body
    );
}

function ChevronLeft() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M15 18l-6-6 6-6" />
        </svg>
    );
}

function ChevronRight() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}
