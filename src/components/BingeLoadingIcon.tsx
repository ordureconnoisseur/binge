import { INFINITY_PATH } from "./BingeLogo";

// Loading glyph: the actual binge silhouette filled with a
// rotating pink → purple → blue gradient. The path stays still
// (so the brand mark is always recognisable); only the gradient
// axis rotates around the centre via SMIL <animateTransform>.
//
// Why SMIL: rotating just the gradient (not the whole element)
// from CSS requires the @property + custom-property trick which
// adds complexity without a clear win — SMIL's
// `animateTransform` on the gradient's `gradientTransform`
// attribute does the same thing in three lines and is well-
// supported across modern browsers (Chrome never actually
// followed through on its 2017 deprecation threat).
export function BingeLoadingIcon({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 512 512"
            className={className}
            aria-hidden="true"
        >
            <defs>
                <linearGradient
                    id="binge-loading-grad"
                    x1="0"
                    y1="256"
                    x2="512"
                    y2="256"
                    gradientUnits="userSpaceOnUse"
                >
                    <stop offset="0%" stopColor="#f472b6" />
                    <stop offset="50%" stopColor="#a855f7" />
                    <stop offset="100%" stopColor="#6aa9ff" />
                    <animateTransform
                        attributeName="gradientTransform"
                        type="rotate"
                        from="0 256 256"
                        to="360 256 256"
                        dur="3s"
                        repeatCount="indefinite"
                    />
                </linearGradient>
            </defs>
            <path d={INFINITY_PATH} fill="url(#binge-loading-grad)" />
        </svg>
    );
}
