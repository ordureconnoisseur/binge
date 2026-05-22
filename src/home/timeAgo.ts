// Short relative-time formatter matching IG's compact style: "3h", "2d",
// "3w". Used in the story header next to the performer name. Returns "now"
// for sub-minute distances; gracefully handles future timestamps by
// reporting them as "now" too rather than negative values.
export function timeAgo(iso: string): string {
    const then = Date.parse(iso);
    if (Number.isNaN(then)) return "";
    const diffMs = Date.now() - then;
    if (diffMs < 60_000) return "now";
    const minutes = Math.floor(diffMs / 60_000);
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks}w`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months}mo`;
    const years = Math.floor(days / 365);
    return `${years}y`;
}
