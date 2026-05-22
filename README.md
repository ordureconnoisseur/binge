# Binge

A vertical-reel browsing layer for [Stash](https://github.com/stashapp/stash). Scroll your library like TikTok, with stories, an Explore grid, and live-rated scenes — all built around Stash's existing GraphQL API.

> _Screenshot placeholder — drop a hero image here once one exists._

---

## What it does

- **Reel** — TikTok/Reels-style vertical scrolling through scenes from your library. Tap to play/pause, double-tap to like (increments Stash's O-counter), swipe to advance, hold the multiview button to send the scene to [stash-multiview](https://github.com/ordureconnoisseur/stash-multiview).
- **Stories** — Instagram-style horizontal row at the top of Home, one bubble per performer with new content. Sources mixed in order: library scenes, new StashDB releases, and (optionally) Reddit posts via [binge-server](https://github.com/ordureconnoisseur/binge-server).
- **Feed** — IG-style post-style scrolling list under the stories row. Each post is a scene with a preview WebM, mute toggle, like, advanced rate, save, Open in Stash.
- **Performer profile** — full-screen page with bio, stats, scene grid, image grid, and a Follow toggle (mapped to Stash's favourite flag). Hash-routed at `#/p/<id>` so the browser back button works.
- **Following / Explore / Saved tabs** — favourited-performer grid with search + sort by last activity; randomised tile grid of every scene; per-collection scene browser with custom collections like "Watch Later" and "Favourite ★".
- **Action stack** — Heart · Rate · Multiview · Scribe · Bookmark · ⋯ (Open in Stash, Auto-scroll toggle).

## Companion plugin integrations

These are detected at runtime — install whichever you want; binge degrades gracefully when they're absent.

| Plugin | What it adds |
|-|-|
| [Refract](https://github.com/ordureconnoisseur/stash-refract) | Tints binge's accent colour to match your refract palette |
| [stash-multiview](https://github.com/ordureconnoisseur/stash-multiview) | Adds a 4-cell grid button in the action stack — taps queue, hold opens player |
| [stash-advanced-scene-rating](https://github.com/ordureconnoisseur/stash-advanced-scene-rating) (ASR) | Replaces the basic 0-5 star rating with binge's native criterion modal |
| [stash-advanced-performer-rating](https://github.com/ordureconnoisseur/stash-advanced-performer-rating) (APR) | Adds a ★ button next to the performer name on profiles for criterion rating |
| [stash-scribe](https://github.com/ordureconnoisseur/stash-scribe) | Adds the Scribe pencil icon to the action stack |

## Optional: Reddit posts in your stories

If you want new Reddit posts from performers' accounts to show up in the stories row, you'll also want to run [binge-server](https://github.com/ordureconnoisseur/binge-server) — a small Go daemon that polls Reddit for you. Without it, stories show library + StashDB content only.

See the [binge-server README](https://github.com/ordureconnoisseur/binge-server#readme) for setup.

## Install

> Once binge is added to the Stash plugin index, you'll install it via Stash → Settings → Plugins. Until then, manual install:

1. Download the latest release zip (or clone this repo).
2. Drop the contents into `~/.stash/plugins/binge/` (or wherever your Stash plugins directory lives).
3. In Stash → Settings → Plugins, find **Binge** and click reload.
4. A new infinity-symbol button appears in the main nav — click it.

That's it. Binge stores all of its preferences in `localStorage` under `binge.*`; nothing in Stash's own config gets touched.

## Settings

Open binge → ⋯ → Settings. All preferences are stored locally per-browser:

- **Stream type** — Auto / Direct / MP4 / WebM / HLS (matches Stash's transcode options)
- **Show galleries** — Mix galleries into the Home feed
- **Lookback days** — How far back "new" means for the stories row (default 30)
- **Include StashDB releases** — Show new releases for performers in your StashDB-configured stashbox
- **Include Reddit posts** — Show Reddit posts (requires binge-server)
- **binge-server URL** — Default `http://localhost:7878`
- **binge-server configuration** — Auto-detects your Stash API key + accepts a Reddit cookie. Only shown when binge-server is reachable.
- **Auto-scroll** — In the reel's ⋯ menu — advance to next scene when the current one ends

## Development

```bash
git clone https://github.com/ordureconnoisseur/binge.git
cd binge
npm install
npm run dev     # vite dev server (for the SPA only — won't be useful standalone)
npm run build   # produces dist/index.html
```

Stack: Vite + React 18 + TypeScript. Output is a single-file SPA (`dist/index.html`) that Stash serves from `/plugin/binge/assets/index.html`. The Stash plugin shim is `binge.entry.js` — it injects the nav button.

To deploy a build to a running Stash instance you'll usually want a
one-liner. `npm run push` reads a local `scripts/push.sh` (gitignored
so each developer keeps their own); a minimal version looks like:

```bash
#!/usr/bin/env bash
set -euo pipefail
scp binge.yml dist/binge.entry.js dist/index.html \
    user@host:'/path/to/stash/plugins/binge/'
```

`chmod +x scripts/push.sh` once and the build-and-deploy cycle is then
`npm run push`.

## Architecture notes

- **No build-time refract integration.** Refract's tokens are picked up at runtime via a `body.stash-liquid-glass` check; binge's accent CSS variable cascades from there.
- **No data layer of its own.** All scene/performer data goes through Stash's GraphQL API (`/graphql`, same origin, cookie-auth). State that needs to survive page reload lives in localStorage.
- **No build-time plugin coupling.** ASR/APR/multiview/scribe presence is detected via Stash's `plugins { id enabled }` query and gated through React context.
- **Hash routing.** `#/home`, `#/foryou`, `#/explore`, `#/following`, `#/saved`, `#/settings`, `#/p/<id>` for direct deep-links + browser back-button support.

## License

MIT. See [LICENSE](./LICENSE).
