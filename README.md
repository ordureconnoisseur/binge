# Binge

An Instagram + TikTok-shaped browsing layer for [Stash](https://github.com/stashapp/stash). Vertical reel, stories row, performer profiles, an Explore page, and a StashDB-powered discovery surface that lets you Follow performers + Add scenes you don't have yet — all backed by Stash's existing GraphQL API.

> _Hero screenshot — see [Screenshots](#screenshots-to-capture) at the bottom for what to drop here._

---

## Highlights

- **Vertical reel** — TikTok-style swipe-through scene viewer with double-tap-to-like, action stack carrying rating, saved collections, multiview + scribe handoffs.
- **Home stories + feed** — IG-style stories row of performers with new content (library + StashDB releases + optional Reddit) on top of a paginated scene feed.
- **Performer profiles** — full-screen profile pages with bio, stats, scene grid, image grid, and a smart social-link row with icons for Twitter/Instagram/TikTok/Reddit/OnlyFans/Fansly + a popup for everything else. Library + StashDB-only variants share the same layout.
- **StashDB discovery** — DISCOVER (co-stars) and TRENDING cards surface scenes you don't have. Follow performers with a Stash-style editable scrape modal. Add their scenes to your library the same way.
- **Mobile-first** — bottom nav, hover-card mini-profiles, performer name `@mention` text links throughout. Touch + desktop parity.

---

## What it does

### Reel · For You
TikTok-style vertical scrolling through scenes. Tap to play/pause, double-tap to like (increments Stash's O-counter), swipe to advance. The right-side action stack carries: **Heart · Rate · Multiview · Scribe · Bookmark · ⋯** (Open in Stash, Auto-scroll toggle).

Filter chips at the top let you constrain the random feed by performer / tag / studio. The chips persist as you scroll.

### Home
Two halves stacked:

1. **Stories row** — horizontal scroll of performer bubbles, one per favourited performer with new content in your lookback window. Sources merge:
    - Library scenes (created or released in the last N days)
    - StashDB new releases (for performers with linked stash_ids you don't already own)
    - Reddit posts (when [binge-server](https://github.com/ordureconnoisseur/binge-server) is running)
2. **Scene feed** — IG-style post cards. Each card has a preview video, the performer header (avatar + hover-card on name), title with expandable description + hashtag row, ⋯ menu (Open in Stash), action row (Like / Rate / Multiview / Scribe / Save / Watch full scene).

**Discovery cards mix in.** Scenes from StashDB you don't have show up as feed cards with a coloured **DISCOVER** (co-stars, orange) or **TRENDING** (StashDB trending, pink) pill, an avatar stack of every library performer on the scene, and inline `@mention` text links for any unfollowed co-performers. Tap **+ Follow** for one-tap onboarding, or **⋯ → Add scene to library** to scrape + create the scene locally.

### Explore
Search scenes, browse a grid, discover performers.

- **Discover Performers bar** sits at the top — horizontal scroll of StashDB's recent-activity female performers. Bubbles ringed green when already in your library; tap → opens their profile (library or StashDB-only as appropriate).
- **Search bar** queries Stash via the standard `q` filter.
- **Recent tag chips** — derived from your interaction history (likes, opens) with a fallback to tags from your recently-liked scenes.
- **Tile grid** of scenes matching the active filters.

### Following
Performers you've toggled `favorite` on, sortable by their most recent activity. Search, jump into any performer's profile, or use this as a curated index of your library.

### Saved
Personal collections — "Watch Later", "Favourite ★", and any custom ones you've made. Each collection opens a 3-column grid (Explore-style) instead of dropping you straight into the reel.

### Performer profile
Full-screen page mirroring Instagram's profile layout:

- Topbar with back button + name (Favourited-tick if applicable, StashDB pill if it's an unfollowed performer)
- Hero row: avatar (with IG-gradient story ring when they have new content) + stats (**scenes / orgasms / rating** — or scenes / in-library / aliases for StashDB-only)
- Bio: name (link → opens in Stash or StashDB), aliases, country · birth year · hair · eyes, details, and a **social-link row** — see below
- Actions: **Favourite** toggle (library) or **+ Follow** button (StashDB-only)
- Tabs: Scenes / Images
- Scenes grid — library scenes mixed with StashDB-only scenes (toggleable per-profile from the heading pill). StashDB tiles wear a corner badge and open AddSceneModal on tap.

Hash-routed: `#/p/<localId>` for library performers, `#/sdbp/<stashDBId>` for StashDB-only. Both deep-linkable + browser-back-friendly.

---

## StashDB discovery

Three interlocking surfaces, all gated by a single Settings toggle (default ON, no-op without a configured StashDB API key):

### 1. Discovery cards in the Home feed
Two seeds funnel into a single de-duped scene list, each tagged with a coloured pill so you know where it came from:

- **DISCOVER** (orange) — recent StashDB scenes featuring at least one performer you already favourite. Any other female performer on those scenes becomes a candidate.
- **TRENDING** (pink) — `sort: TRENDING` against StashDB (the same query that powers their homepage's Trending Scenes section). Ranks by recent activity, not release date.

Each card represents ONE scene. The header shows an **avatar stack** of every library performer on the scene (overlapping circles, click any one to jump straight to their profile), headlined by:
1. A library performer if any are on the scene (no Follow needed — they're already there).
2. Otherwise the **most popular** unfollowed female performer (highest `scene_count`).

Co-performers that aren't in your library appear as inline `@mention` text links in the card body; hovering (or tapping on mobile) opens their mini-profile card with Follow + Open profile inline.

### 2. Follow modal
Tap **+ Follow** anywhere — Stash-style "Add to library" sheet opens. Auto-fetches the full StashDB performer record + image carousel, pre-fills an editable form that mirrors Stash's own `PerformerEditPanel` field set exactly (name, gender, birthdate, country, height, measurements, fake_tits, career years, tattoos, piercings, URLs, etc.). Submit → `performerCreate` with a `stash_ids` link so future merges auto-resolve.

### 3. Add scene to library
On any discovery card, **⋯ → Add scene to library** opens AddSceneModal — same shape as the performer modal, but for scenes. Scrapes title, code, director, date, urls, cover image carousel from StashDB; resolves performer + studio `stash_ids` to local IDs before submitting `sceneCreate`. After Add, the scene drops out of the discovery feed and shows up via the library path on next refresh.

### Performer-profile mixin (toggleable)
When viewing a library performer's profile, you can interleave scenes from their StashDB catalogue that you don't already own into the grid (sorted by release date). StashDB-only tiles wear a blue badge and open AddSceneModal on tap. Off by default — flip the **StashDB** pill in the scenes-section heading on any performer who has a linked stash_id, or set the global default in Settings.

### Social links on profiles
The bio row carries a smart link strip. Known platforms get their own coloured pill with the brand glyph:

- **Twitter / X** (incl. x.com, t.co)
- **Instagram** (incl. instagr.am)
- **TikTok**
- **Reddit**
- **OnlyFans**
- **Fansly**

Everything else collapses into a single `🔗 N` pill that opens a centred popup listing the URLs verbatim — keeps the bio tidy when a performer has half a dozen miscellaneous sites linked. Works on library + StashDB-only profiles. Reads from Stash's deprecated `twitter`/`instagram`/`url` fields *and* the modern `urls[]` array, de-duped and host-normalised so subdomains all match.

---

### Performer hover cards
Hover (desktop) or tap (mobile) almost any performer name or avatar in binge → IG-style mini-profile pops up:

- Avatar, name, gender · age
- "In library" (green) or "StashDB" (blue) pill
- **Open profile** button (jumps to the appropriate profile page)
- **Follow** button (only on StashDB-only performers; opens the same FollowPerformerModal as elsewhere)

Available on: discovery cards (primary + co-stars), library scene cards (avatars + name button), Discover Performers bar bubbles.

---

## Mobile UI

At ≤720px viewports:

- **Bottom nav** replaces the top tab bar. Five slots: Home · For You · Explore · Following · Menu. IG-style icons (filled when active).
- **Auto-hides** on scroll-down through the reel; reappears on scroll-up. Same gesture as Instagram Reels.
- Floating top-right buttons for context: home/burger on Home, filter gear on For You.
- **Menu page** — "More" surface listing Saved + Settings as bordered cards.
- Sheets (Save / Rate / Follow / Add Scene) all use Stash's native bottom-sheet pattern with detents.
- iOS `safe-area-inset-bottom` respected throughout.

---

## Companion plugin integrations

Detected at runtime — install whichever you want; binge degrades gracefully when they're absent.

| Plugin | What it adds |
|-|-|
| [Refract](https://github.com/ordureconnoisseur/stash-refract) | Tints binge's accent colour to match your refract palette (opt-in toggle) |
| [stash-multiview](https://github.com/ordureconnoisseur/stash-multiview) | 4-cell grid button in the action stack — tap to queue, hold to open the player |
| [stash-advanced-rating](https://github.com/ordureconnoisseur/stash-advanced-rating) | Replaces the basic 0-5 star rating with binge's native criterion modal (scene reel + performer profile) |
| [stash-scribe](https://github.com/ordureconnoisseur/stash-scribe) | Adds the Scribe pencil icon to the action stack |

### Optional: binge-server (Reddit posts in stories)

If you want new Reddit posts from performers' accounts to show up in the stories row, run [binge-server](https://github.com/ordureconnoisseur/binge-server) — a small Go daemon that polls Reddit on your behalf. Without it, stories show library + StashDB content only.

---

## Install

binge is published to [`ordureconnoisseur/plugins`](https://github.com/ordureconnoisseur/plugins) — add that as a source in **Stash → Settings → Plugins → Available Plugins → Add Source** with this URL:

```
https://ordureconnoisseur.github.io/plugins/index.yml
```

Then install **Binge** from the list. An infinity-symbol button appears in Stash's main nav — click it.

### Manual install

```bash
# Download the latest release zip from
# https://github.com/ordureconnoisseur/binge/releases
unzip binge-vX.Y.Z.zip -d ~/.stash/plugins/binge/
```

Then **Stash → Settings → Plugins → Reload Plugins**.

binge stores all of its preferences in `localStorage` under `binge.*`; nothing in Stash's own config gets touched.

---

## Settings

Open binge → ⋯ → Settings (desktop) or Menu → Settings (mobile). All preferences stored locally per-browser:

| Setting | Default | Notes |
|-|-|-|
| **Stream type** | Auto | Auto / Direct / MP4 / WebM / HLS — matches Stash's transcode options |
| **Show galleries in feed** | On | Mix galleries into the Home feed |
| **Recent window** | 30 days | How far back "new" means for stories + feed. 7 / 14 / 30 / 60 / 90 / 180 / 365 |
| **Include StashDB new releases in stories** | On | Surface new releases for performers with linked stash_ids. No-op without a configured StashDB API key. |
| **Mix StashDB scenes into performer profiles** | **Off** | Interleave StashDB scenes you don't own into library performer profile grids. Also flip-able per-profile from the scenes-heading pill. |
| **Include Reddit posts in stories** | On | Requires binge-server running (silent no-op otherwise) |
| **binge-server URL** | `http://localhost:7878` | Override if running remotely |
| **binge-server configuration** | — | Auto-detects your Stash API key + accepts a Reddit cookie. Visible only when binge-server is reachable. |
| **Follow refract accent** | Off | Mirror refract's accent palette into binge |
| **Auto-scroll** | Off | In the reel's ⋯ menu — advance to next scene when current ends |
| **Show debug overlay** | Off | Per-slide debug HUD; toggle via the `\` hotkey in the reel |

---

## Architecture

- **Vite + React 19 + TypeScript** bundled to a single-file SPA (`dist/index.html`) that Stash serves from `/plugin/binge/assets/index.html`. The plugin shim `binge.entry.js` injects the nav button.
- **All data through Stash's GraphQL** (`/graphql`, same-origin cookie auth). No backend of binge's own.
- **StashDB queries hit `https://stashdb.org/graphql` directly** with the user's API key (read from Stash's stashbox config). Caches at 12h TTL in localStorage.
- **Hash routing**: `#/home`, `#/foryou`, `#/explore`, `#/following`, `#/saved`, `#/settings`, `#/menu`, `#/p/<localId>`, `#/sdbp/<stashDBId>` — direct deep-links + browser back work.
- **No build-time plugin coupling**. ASR/APR/multiview/scribe/refract presence detected via `plugins { id enabled }` and gated through React context.
- **No build-time refract integration**. Refract's tokens picked up at runtime via a `body.stash-liquid-glass` check; binge's accent CSS variable cascades from there.

---

## Development

```bash
git clone https://github.com/ordureconnoisseur/binge.git
cd binge
npm install
npm run dev     # Vite dev server (SPA only — runs alone but no Stash data)
npm run build   # produces dist/index.html
npm run push    # build + deploy via scripts/push.sh (your own)
```

Stack: **Vite + React 19 + TypeScript + TanStack Virtual** (reel virtualization).

Local deploy helper: `scripts/push.sh` is gitignored — write your own one-liner. Minimal version:

```bash
#!/usr/bin/env bash
set -euo pipefail
scp binge.yml dist/binge.entry.js dist/index.html \
    user@host:'/path/to/stash/plugins/binge/'
```

Then `chmod +x scripts/push.sh` and `npm run push` builds-and-deploys in one go.

---

## License

MIT. See [LICENSE](./LICENSE).

---

## Screenshots to capture

For the README's visual gallery — what to grab, in priority order:

### Hero (top of README)
1. **Reel slide in action** (video preferred) — a scene playing, action stack visible on the right, performer info bottom-left. The signature shot. Wide aspect (16:9 or 21:9) ideal for the hero.

### Core features (interspersed in sections above)
2. **Home — stories row + feed cards** — captures both halves of Home in one screenshot. Some bubbles ringed, a couple of scene cards visible.
3. **Home — discovery card** — close-up of a single discovery feed card showing the coloured **DISCOVER** or **TRENDING** pill, the **avatar stack** of library performers on the scene, the cover image, the `+ Follow` pill, and the `@mention` co-star row at the bottom. Capture one of each pill type (orange + pink) side-by-side if possible.
4. **Library performer profile** — bio + stats (scenes / orgasms / rating) + scene grid for a performer you have lots of scenes for. Make sure the **social-link row** is populated — pick one with Twitter / Instagram / OnlyFans pills visible.
5. **StashDB-only performer profile** — same layout, but with the blue "StashDB" pill next to the name + the `+ Follow` button + StashDB scene tiles with corner badges.
6. **Library profile with StashDB mixin** — scene grid showing both library tiles AND StashDB-only tiles (badge-marked) interleaved, with the green **StashDB** pill in the scenes-section heading toggled on.
7. **Other-links popup** — open the `🔗 N` chip on a performer with several misc URLs; capture the centred popup listing them.
8. **Explore — Discover Performers bar** — the top section, focused screenshot of the horizontal bubble row.
9. **Explore — full page** — the bubble row + search bar + tag chips + tile grid below.

### Modals + popups
10. **FollowPerformerModal** — open form showing the carousel-displayed photo, name field, all the editable fields. Two side-by-side variants if possible: one with full StashDB data scraped, one mid-edit.
11. **AddSceneModal** — open form for adding a StashDB scene. Cover carousel + performer chips + editable fields.
12. **PerformerHoverCard** — mini-profile pop-up. Two variants:
    - "In library" (green pill, Open profile button)
    - "StashDB" (blue pill, Follow + Open profile buttons)

### Mobile
13. **Mobile Home** — full screen with bottom nav visible.
14. **Mobile reel** — full-screen scene, bottom nav hiding state.
15. **Mobile Menu page** — the "More" surface with Saved + Settings rows.
16. **Mobile bottom nav close-up** — the 5 icons (Home · For You · Explore · Following · Menu), one active.

### Optional polish
17. **Saved tab** — a collection's 3-column grid.
18. **Reel ⋯ menu open** — showing the Auto-scroll toggle + Open in Stash.
19. **Settings page** — scrolled to show the StashDB section, with both toggles visible.

For each: prefer dark-mode (binge's default), 1440×900 viewport for desktop shots, 390×844 (iPhone 14 Pro) for mobile. Crop tight — full-bleed UI looks better than browser chrome.

Recommended host: upload to the existing **`media-assets` GitHub Release** on the binge repo via `gh release upload media-assets <file>`, then link the asset URL inline. Keeps the repo small and gives stable CDN URLs.
