interface PerformerStatsRowProps {
    sceneCount: number | null;
    oCounter: number | null;
    rating100: number | null;
}

// Three-column number block: scenes / O / rating. Big number on top,
// small uppercase label below — the standard Instagram profile metric row.
// (Was galleries before — replaced with rating because galleries are
// rarely populated on most Stash setups and rating is the more
// useful at-a-glance signal.)
export function PerformerStatsRow({
    sceneCount,
    oCounter,
    rating100,
}: PerformerStatsRowProps) {
    return (
        <ul className="binge-profile-stats">
            <Stat value={sceneCount} label="scenes" />
            <Stat value={oCounter} label="orgasms" />
            <RatingStat rating100={rating100} />
        </ul>
    );
}

function Stat({ value, label }: { value: number | null; label: string }) {
    return (
        <li className="binge-profile-stat">
            <span className="binge-profile-stat-value">{formatStat(value)}</span>
            <span className="binge-profile-stat-label">{label}</span>
        </li>
    );
}

function RatingStat({ rating100 }: { rating100: number | null }) {
    return (
        <li className="binge-profile-stat">
            <span className="binge-profile-stat-value">
                {formatRating(rating100)}
            </span>
            <span className="binge-profile-stat-label">rating</span>
        </li>
    );
}

function formatStat(n: number | null): string {
    if (n == null) return "—";
    if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k");
    return String(n);
}

// Stash stores 0–100; show as 0–10 with one decimal. Drop trailing
// `.0` so an unfractional rating renders as "8" not "8.0" — keeps
// the row compact at the same width as the count stats.
function formatRating(n: number | null): string {
    if (n == null) return "—";
    const v = n / 10;
    if (Number.isInteger(v)) return String(v);
    return v.toFixed(1);
}
