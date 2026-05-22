import type { ReactNode } from "react";
import type { PerformerDetail } from "../api/queries";

interface PerformerBioProps {
    performer: PerformerDetail;
    // Optional inline accessory rendered next to the name h1 (e.g.
    // the advanced-rating "★ Rate" trigger). Kept as a slot so the
    // bio component stays decoupled from rating logic.
    nameAccessory?: ReactNode;
}

// Name + aliases + compact attribute row + details (3-line clamp) + link chips.
// Each block only renders when its data is present, so a sparse performer
// doesn't show a wall of empty rows.
export function PerformerBio({ performer, nameAccessory }: PerformerBioProps) {
    const attributes: string[] = [];
    if (performer.country) attributes.push(performer.country);
    const birthYear = parseBirthYear(performer.birthdate);
    if (birthYear) attributes.push(String(birthYear));
    if (performer.hair_color) attributes.push(performer.hair_color);
    if (performer.eye_color) attributes.push(`${performer.eye_color} eyes`);

    const aliases = performer.alias_list ?? [];

    const handleOpenInStash = () => {
        window.open(
            `/performers/${performer.id}`,
            "_blank",
            "noopener,noreferrer"
        );
    };

    return (
        <section className="binge-profile-bio">
            <div className="binge-profile-name-row">
                <h1 className="binge-profile-name">
                    <button
                        type="button"
                        className="binge-profile-name-link"
                        onClick={handleOpenInStash}
                        title="Open in Stash"
                        aria-label={`Open ${performer.name} in Stash`}
                    >
                        {performer.name}
                    </button>
                </h1>
                {nameAccessory}
            </div>
            {aliases.length > 0 && (
                <p className="binge-profile-aliases">
                    a.k.a. {aliases.join(", ")}
                </p>
            )}
            {attributes.length > 0 && (
                <p className="binge-profile-attrs">{attributes.join(" · ")}</p>
            )}
            {performer.details && (
                <p className="binge-profile-details">{performer.details}</p>
            )}
            {(performer.twitter || performer.instagram || performer.url) && (
                <div className="binge-profile-links">
                    {performer.twitter && (
                        <LinkChip
                            href={linkUrl("twitter", performer.twitter)}
                            label="Twitter"
                        />
                    )}
                    {performer.instagram && (
                        <LinkChip
                            href={linkUrl("instagram", performer.instagram)}
                            label="Instagram"
                        />
                    )}
                    {performer.url && (
                        <LinkChip href={performer.url} label="Website" />
                    )}
                </div>
            )}
        </section>
    );
}

function LinkChip({ href, label }: { href: string; label: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noreferrer noopener"
            className="binge-profile-link-chip"
        >
            {label}
        </a>
    );
}

function parseBirthYear(birthdate: string | null): number | null {
    if (!birthdate) return null;
    const m = birthdate.match(/^(\d{4})/);
    return m ? Number(m[1]) : null;
}

// Stash stores socials as either a handle or full URL — normalize to a full URL.
function linkUrl(platform: "twitter" | "instagram", value: string): string {
    if (/^https?:\/\//i.test(value)) return value;
    const handle = value.replace(/^@/, "");
    if (platform === "twitter") return `https://twitter.com/${handle}`;
    return `https://instagram.com/${handle}`;
}
