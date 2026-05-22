interface PerformerStatsRowProps {
    sceneCount: number | null;
    oCounter: number | null;
    galleryCount: number | null;
}

// Three-column number block: scenes / O / galleries. Big number on top,
// small uppercase label below — the standard Instagram profile metric row.
export function PerformerStatsRow({
    sceneCount,
    oCounter,
    galleryCount,
}: PerformerStatsRowProps) {
    return (
        <ul className="binge-profile-stats">
            <Stat value={sceneCount} label="scenes" />
            <Stat value={oCounter} label="orgasms" />
            <Stat value={galleryCount} label="galleries" />
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

function formatStat(n: number | null): string {
    if (n == null) return "—";
    if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
    if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`.replace(".0k", "k");
    return String(n);
}
