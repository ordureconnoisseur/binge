import { useEffect, useRef, useState } from "react";
import type { GalleryFeedItem } from "./useFeed";
import { ImageLightbox } from "../performer/ImageLightbox";
import { usePerformerProfile } from "../performer/PerformerProfileContext";
import { timeAgo } from "./timeAgo";

interface GalleryFeedCardProps {
    item: GalleryFeedItem;
}

// Gallery-as-post IG-style card. Horizontal scroll-snap carousel of up
// to MAX_GALLERY_IMAGES (from useFeed); a "View gallery →" panel
// follows as the final slide so the user can jump into the full
// ImageLightbox even when they've scrolled to the end inline.
//
// Tap any image → lightbox at that index. Tap the end panel → lightbox
// at index 0.
export function GalleryFeedCard({ item }: GalleryFeedCardProps) {
    const carouselRef = useRef<HTMLDivElement>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [lightboxOpenAt, setLightboxOpenAt] = useState<number | null>(null);

    const { openProfile } = usePerformerProfile();
    const primaryPerformer = item.performers[0];

    // Total slide count: N images + 1 "View gallery" panel. The panel
    // gets its own snap slot, so the dots indicator needs to track it
    // too (last dot = the end panel).
    const slideCount = item.images.length + 1;

    // Update activeIndex as the carousel scrolls. Uses scroll position
    // / clientWidth math — robust against snap timing differences
    // between browsers and avoids needing one IntersectionObserver
    // per slide.
    useEffect(() => {
        const el = carouselRef.current;
        if (!el) return;
        let raf: number | null = null;
        const handle = () => {
            raf = null;
            if (!el.clientWidth) return;
            const idx = Math.round(el.scrollLeft / el.clientWidth);
            setActiveIndex(idx);
        };
        const onScroll = () => {
            if (raf === null) raf = requestAnimationFrame(handle);
        };
        el.addEventListener("scroll", onScroll, { passive: true });
        return () => {
            el.removeEventListener("scroll", onScroll);
            if (raf !== null) cancelAnimationFrame(raf);
        };
    }, []);

    const scrollToSlide = (i: number) => {
        const el = carouselRef.current;
        if (!el) return;
        el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    };

    return (
        <article className="binge-feed-card binge-feed-card-gallery">
            <header className="binge-feed-card-header">
                <button
                    type="button"
                    className="binge-feed-card-author"
                    onClick={() =>
                        primaryPerformer && openProfile(primaryPerformer.id)
                    }
                    aria-label={primaryPerformer?.name ?? "Performer"}
                >
                    <span
                        className="binge-feed-card-avatar"
                        style={
                            primaryPerformer?.imagePath
                                ? {
                                      backgroundImage: `url(${primaryPerformer.imagePath})`,
                                  }
                                : undefined
                        }
                    >
                        {!primaryPerformer?.imagePath && (
                            <span className="binge-feed-card-initial">
                                {primaryPerformer?.name
                                    .charAt(0)
                                    .toUpperCase() ?? "?"}
                            </span>
                        )}
                    </span>
                    <span className="binge-feed-card-name">
                        {item.performers.map((p) => p.name).join(", ") ||
                            "Gallery"}
                    </span>
                </button>
                <span className="binge-feed-card-time">
                    {timeAgo(item.effectiveAt)}
                </span>
            </header>

            <div className="binge-gallery-media">
                <div
                    className="binge-gallery-carousel"
                    ref={carouselRef}
                    role="region"
                    aria-roledescription="carousel"
                    aria-label={item.title ?? "Gallery images"}
                >
                    {item.images.length === 0 ? (
                        // Empty image list — typically means the gallery
                        // exists but no images have been ingested yet.
                        // Show the cover thumbnail as a single slide.
                        <button
                            type="button"
                            className="binge-gallery-slide"
                            style={
                                item.coverPath
                                    ? {
                                          backgroundImage: `url(${item.coverPath})`,
                                      }
                                    : undefined
                            }
                            onClick={() => setLightboxOpenAt(0)}
                            aria-label={`Open ${item.title ?? "gallery"}`}
                        />
                    ) : (
                        item.images.map((img, idx) => {
                            const src =
                                img.paths.thumbnail || img.paths.image || "";
                            return (
                                <button
                                    type="button"
                                    key={img.id}
                                    className="binge-gallery-slide"
                                    style={
                                        src
                                            ? { backgroundImage: `url(${src})` }
                                            : undefined
                                    }
                                    onClick={() => setLightboxOpenAt(idx)}
                                    aria-label={`Image ${idx + 1} of ${
                                        item.imageCount
                                    }`}
                                />
                            );
                        })
                    )}

                    {/* End panel — always rendered so the carousel has
                        a "more →" outro slot even on small galleries. */}
                    <button
                        type="button"
                        className="binge-gallery-slide binge-gallery-end"
                        onClick={() => setLightboxOpenAt(0)}
                        aria-label="View full gallery"
                    >
                        <span className="binge-gallery-end-inner">
                            <span className="binge-gallery-end-label">
                                View gallery
                            </span>
                            <span className="binge-gallery-end-sub">
                                {item.imageCount}{" "}
                                {item.imageCount === 1 ? "photo" : "photos"}
                            </span>
                            <ChevronRight />
                        </span>
                    </button>
                </div>

                {/* Image count badge (top-right of media). */}
                <div className="binge-gallery-count-badge" aria-hidden="true">
                    <StackIcon />
                    <span>{item.imageCount}</span>
                </div>
            </div>

            {/* Dots indicator (one per slide including the end panel). */}
            {slideCount > 1 && (
                <div
                    className="binge-gallery-dots"
                    role="tablist"
                    aria-label="Gallery position"
                >
                    {Array.from({ length: slideCount }).map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            role="tab"
                            aria-selected={i === activeIndex}
                            className={
                                "binge-gallery-dot" +
                                (i === activeIndex ? " is-active" : "")
                            }
                            onClick={() => scrollToSlide(i)}
                            tabIndex={-1}
                            aria-label={`Go to slide ${i + 1}`}
                        />
                    ))}
                </div>
            )}

            {item.title && (
                <div className="binge-feed-card-caption">{item.title}</div>
            )}

            {lightboxOpenAt !== null && item.images.length > 0 && (
                <ImageLightbox
                    images={item.images}
                    startIndex={lightboxOpenAt}
                    onClose={() => setLightboxOpenAt(null)}
                />
            )}
        </article>
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
            width="20"
            height="20"
        >
            <path d="M9 6l6 6-6 6" />
        </svg>
    );
}

function StackIcon() {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            width="14"
            height="14"
        >
            <rect x="7" y="3" width="14" height="14" rx="2" />
            <path d="M3 7v12a2 2 0 0 0 2 2h12" />
        </svg>
    );
}
