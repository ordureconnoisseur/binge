import { useEffect, useRef, useState } from "react";
import {
    findImagesByPerformer,
    type PerformerDetail,
    type PerformerImageCard,
} from "../api/queries";
import { ImageLightbox } from "./ImageLightbox";

interface PerformerImageGridProps {
    performer: PerformerDetail;
}

const PAGE_SIZE = 30;
const NEAR_BOTTOM_PX = 600;

// Instagram-style square photo grid. Tap a thumbnail to open the
// lightbox positioned at that index; the lightbox itself handles
// prev/next nav.
export function PerformerImageGrid({ performer }: PerformerImageGridProps) {
    const [images, setImages] = useState<PerformerImageCard[]>([]);
    const [count, setCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

    useEffect(() => {
        setImages([]);
        setCount(null);
        setPage(1);
        setError(null);
    }, [performer.id]);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        setError(null);
        findImagesByPerformer(performer.id, page, PAGE_SIZE)
            .then((res) => {
                if (!alive) return;
                setCount(res.count);
                setImages((prev) =>
                    page === 1 ? res.images : [...prev, ...res.images]
                );
            })
            .catch((err: Error) => {
                if (!alive) return;
                setError(err.message);
            })
            .finally(() => {
                if (alive) setLoading(false);
            });
        return () => {
            alive = false;
        };
    }, [performer.id, page]);

    // Same infinite-scroll pattern as PerformerSceneGrid — the .binge-profile-body
    // is the scrolling ancestor, observe a sentinel near the grid bottom.
    const sentinelRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        const sentinel = sentinelRef.current;
        if (!sentinel) return;
        if (count == null) return;
        if (images.length >= count) return;
        if (loading) return;

        const observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    if (entry.isIntersecting) {
                        setPage((p) => p + 1);
                    }
                }
            },
            { rootMargin: `0px 0px ${NEAR_BOTTOM_PX}px 0px` }
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [count, images.length, loading]);

    return (
        <section className="binge-profile-photos">
            {error && (
                <div className="binge-status binge-status-error">
                    error: {error}
                </div>
            )}
            {images.length === 0 && loading && (
                <div className="binge-status">loading…</div>
            )}
            {images.length === 0 && !loading && !error && (
                <div className="binge-status">no photos</div>
            )}
            {images.length > 0 && (
                <ul className="binge-profile-photo-grid">
                    {images.map((img, i) => (
                        <li key={img.id} className="binge-profile-photo-cell">
                            <button
                                type="button"
                                className="binge-profile-photo-card"
                                onClick={() => setLightboxIndex(i)}
                                title={img.title || `Image ${img.id}`}
                            >
                                <img
                                    src={
                                        img.paths.thumbnail ||
                                        img.paths.image ||
                                        ""
                                    }
                                    alt={img.title || ""}
                                    className="binge-profile-photo-thumb"
                                    loading="lazy"
                                />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <div ref={sentinelRef} aria-hidden="true" />
            {loading && images.length > 0 && (
                <div className="binge-status binge-profile-scenes-loading">
                    loading more…
                </div>
            )}
            {lightboxIndex != null && (
                <ImageLightbox
                    images={images}
                    startIndex={lightboxIndex}
                    onClose={() => setLightboxIndex(null)}
                />
            )}
        </section>
    );
}
