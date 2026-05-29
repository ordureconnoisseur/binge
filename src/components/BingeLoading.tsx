import { BingeLoadingIcon } from "./BingeLoadingIcon";

// In-context loading indicator — animated stroked-infinity glyph
// (a coloured segment traces around the figure-8). Same visual
// vocabulary as BingeStartupSplash so every loading moment in
// the app shares one identity.
//
// Wrap in `.binge-loading` (centred, padded). `compact` shrinks
// the glyph for tighter surfaces like dropdowns or list rows.
export function BingeLoading({
    compact = false,
    minHeight,
}: {
    compact?: boolean;
    /// Optional minHeight on the wrapper — useful when the
    /// surface this replaces has a height the user might not
    /// expect to collapse (e.g. a feed wrapper where preserving
    /// scroll position matters). Pass a CSS length like "60vh"
    /// or "200px"; omit for natural height.
    minHeight?: string;
}) {
    return (
        <div
            className={"binge-loading" + (compact ? " is-compact" : "")}
            style={minHeight ? { minHeight } : undefined}
            aria-label="Loading"
            role="status"
        >
            <BingeLoadingIcon className="binge-loading-icon" />
        </div>
    );
}
