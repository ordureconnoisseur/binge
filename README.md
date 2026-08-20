# Binge

An Instagram-shaped social + discovery layer for [Stash](https://github.com/stashapp/stash). Vertical reel, stories, performer profiles, StashDB-powered discovery, all backed by Stash's existing GraphQL API. Web plugin; a native iOS port tracks feature-parity but isn't public yet.

An optional companion daemon, [binge-server](https://github.com/ordureconnoisseur/binge-server), extends the same surfaces past your library: new Reddit, X and PornHub posts from the performers you already follow, and a one-tap save back into Stash. It installs from binge's own Settings page.

<p align="center"><img src="screenshots/hero.webp" alt="binge, reels, stories, and discovery for your Stash library" width="840" /></p>

---

## Highlights

- **Vertical reel**: swipe-through scenes, double-tap-to-like, hold the top-right corner for 2x, action stack (rating, multiview, scribe, save, ⋯).
- **Home stories + feed**: IG-style stories row of performers with new content (library + StashDB, plus off-site posts when binge-server is running) above a paginated scene feed. Bulk imports collapse into single pack cards.
- **Performer profiles**: bio, stats, scene grid, image grid, social-link strip with branded icons for Twitter / Instagram / TikTok / Reddit / OnlyFans / Fansly + a 🔗 popup for the rest. Library + StashDB-only variants share the layout.
- **StashDB discovery**: DISCOVER + TRENDING cards in Home; Follow performers + Add scenes you don't have, both via Stash-style scrape modals.
- **Beyond your library** (needs binge-server): a performer's new Reddit, X and PornHub posts join the same stories row and profile, and anything you like there saves straight into Stash.
- **Mobile-first**: bottom nav, hover-card mini-profiles, performer `@mention` links. Touch + desktop parity.

---

## What it does

> Screenshots show **placeholder content**: gradient artwork and invented performer names, so nothing real appears. A few surfaces are missing from them for the same reason. The Follow and Add-scene modals, the Discover Performers bar, discovery cards, hover cards and social links all need live StashDB data, which placeholder mode deliberately switches off so no real names can leak into a screenshot.

### Reel · For You

<img align="right" width="440" src="screenshots/reel.webp" alt="Vertical For You reel with the action stack" />

Vertical swipe through scenes. Tap to play/pause, double-tap to like, swipe to advance. Hold the top-right corner to watch at 2x, and pull down while holding to leave it there; hold and pull again to drop back. Right-side action stack: **Heart · Rate · Multiview · Scribe · Bookmark · ⋯**. Filter chips at top constrain the random feed by performer / tag / studio and persist as you scroll.

<br clear="all" />

<p align="center"><img width="560" src="screenshots/reel-menu.webp" alt="Reel overflow menu with the auto-scroll toggle and Open in Stash" /></p>

The **⋯** opens a sheet with auto-scroll (advance when a scene ends) and a link straight to the scene in Stash.

### Home

<img align="right" width="440" src="screenshots/home.webp" alt="Home, stories row over a scene feed with a collapsed pack card" />

**Stories row** of performers with fresh content: library scenes within your lookback, StashDB new releases, and (with binge-server running) their latest Reddit posts and PornHub uploads. Tap a bubble → IG-style story viewer with auto-advance and a "Watch full scene" CTA into the reel. Off-site posts carry a source badge, a link out, and a **Save to Stash** button.

**Scene feed** of IG-style cards: preview video, performer header (avatar + hover-card), title + expandable description + hashtags, action row. Bulk imports of one performer collapse into a single **Pack card** with a 3×3 mosaic, which keeps one prolific performer from dominating the feed.

**Discovery cards** mix in. StashDB scenes you don't own appear with a coloured **DISCOVER** (co-stars) or **TRENDING** pill, an avatar stack of library performers on the scene, and `@mention` text links for unfollowed co-performers. Tap **+ Follow** for one-tap onboarding or **⋯ → Add scene to library** to scrape + create locally.

The filter menu beside the Home title hides whole card categories (Discover, Trending, Posts, Reposts) when you want a quieter feed.

<br clear="all" />

<p align="center"><img width="460" src="screenshots/story.webp" alt="Story viewer, performer carousel, progress strip, Watch full scene" /></p>

<!-- TODO (live data): discovery-card, DISCOVER/TRENDING pill + avatar stack + Follow + @mentions -->

### Explore

<img align="right" width="440" src="screenshots/explore.webp" alt="Explore, tag chips over a scene grid" />

Search bar (Stash's `q` filter), recent-tag chips (from your interaction history), tile grid of scenes. A **Discover Performers** bubble row at top scrolls through StashDB's recent-activity performers (filtered to your enabled genders). Tap → profile.

<br clear="all" />

<!-- TODO (live data): explore-discover-bar, Discover Performers bubble row -->

### Following · Saved

<img align="right" width="440" src="screenshots/following.webp" alt="Following, favourites + all performers" />

Following lists performers you've favourited, sorted by recent activity. Saved holds your collections (Watch Later, Favourite ★, and any custom ones); each opens a 3-column grid.

<br clear="all" />

<p align="center">
  <img src="screenshots/saved.webp" width="44%" alt="Saved, collections with cover mosaics" />
  <img src="screenshots/collection.webp" width="44%" alt="Collection detail, 3-column grid" />
</p>

### Performer profile

<img align="right" width="440" src="screenshots/profile.webp" alt="Performer profile, bio, stats, scene grid" />

Full-screen page mirroring Instagram's profile layout: avatar (with binge's pink→purple→blue story ring on new content), bio, stats, **social-link row**, Favourite/Follow action, Scenes + Images tabs. StashDB-only profiles get a **+ Follow** button instead of the favourite toggle, plus a Stash-style scrape modal. Hash-routed: `#/p/<localId>` and `#/sdbp/<stashDBId>`, both deep-linkable.

The scenes grid sorts by Recent, Most views, Most orgasms, Highest rated or Recently added, and each tile carries a badge showing the stat you sorted by. With binge-server running, that performer's PornHub videos join the grid as extra tiles (hover to preview, tap for inline playback) and their last week of X media folds into their story ring.

<br clear="all" />

<!-- TODO (live data): profile-stashdb (Follow + badged tiles) · profile-mixin -->

---

## StashDB discovery

Single Settings toggle, default ON, no-op without a StashDB API key. Three surfaces:

1. **Home discovery cards**: DISCOVER (recent StashDB scenes featuring a performer you favourite, with an unfollowed co-star as the headliner) + TRENDING (`sort: TRENDING` against StashDB). Both pills brand-pink; the label is the differentiator.
2. **Follow modal**: Tap **+ Follow** anywhere → Stash-style sheet with the StashDB performer record + image carousel pre-filled. Submit → `performerCreate` with a `stash_ids` link so future merges resolve.
3. **Add scene modal**: On any discovery card, **⋯ → Add scene to library** scrapes title / code / director / date / urls / cover, resolves performer + studio `stash_ids` to local IDs, submits `sceneCreate`.

**Performer-profile mixin** (off by default): toggle the StashDB pill in any library profile's scenes heading to interleave that performer's unowned StashDB scenes into the grid. Mixed-in tiles wear a blue badge and open AddSceneModal on tap.

<!-- TODO: 10-follow-modal, open FollowPerformerModal with scraped data + carousel -->
<!-- TODO: 11-add-scene-modal, open AddSceneModal with cover carousel + chips -->

### Social links

Bio row carries a smart link strip. Known platforms (Twitter, Instagram, TikTok, Reddit, OnlyFans, Fansly) get branded pills; everything else collapses into a 🔗 N popup. Reads from Stash's deprecated `twitter`/`instagram`/`url` fields and the modern `urls[]` array, de-duped and host-normalised.

<!-- TODO: 07-other-links-popup, 🔗 N popup with miscellaneous URLs -->

### Hover cards

Hover (desktop) or tap (mobile) any performer name or avatar → mini-profile pops up with avatar, name, gender · age, "In library" (green) or "StashDB" (blue) pill, **Open profile** + (for StashDB-only) **Follow**. Available on discovery cards, library scene cards, and Discover Performers bubbles.

<!-- TODO: 12-hovercard, in-library + StashDB hover cards side-by-side -->

---

## binge-server (optional)

Out of the box binge talks to nothing but your own Stash. [binge-server](https://github.com/ordureconnoisseur/binge-server) is a small Go daemon you can run beside it that follows the same performers off-site, using the social links already on their Stash records. It adds four things:

| Pillar            | Where it shows up                                                                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Reddit**        | New posts from a performer's subreddit or user account, in the stories row                                                                                        |
| **X (Twitter)**   | Their last 7 days of media, folded into their profile's story ring. Fetched when you open the profile, not polled. Needs your own X cookies, pasted into Settings |
| **PornHub**       | New uploads in the stories row, plus their back catalogue as extra tiles in the profile scenes grid with hover previews and inline playback                       |
| **Save to Stash** | A save button in the story viewer and the PornHub player. Hands the original source URL to the daemon, which downloads it into a library folder you pick          |

Every pillar has its own Settings toggle, and each one fails quiet: with no daemon reachable the fetches no-op and binge behaves exactly as it does without one.

Reddit and X are reached with session cookies out of your own browser, and those expire every few months. When that happens the Settings card says so, with the date the stories stopped, rather than leaving you to work out why nothing is arriving. Paste a fresh cookie, or drop in a new `cookies.txt`, and it clears.

**Installing it.** Settings has an install card. Press **Install binge-server** and Stash runs the installer on its own host, preferring Docker and falling back to the release binary, which it checks against the checksum published with the release before running it. A browser can't install software, so this goes through a Stash plugin task (it needs `python` on the Stash host; nothing else in binge does). If Stash itself runs in a container, the card offers a compose service to paste instead. Once the daemon answers, the card turns into a status row and the Reddit and X login fields appear, which accept a `cookies.txt` export as well as pasted values.

If you run the daemon somewhere else, set **binge-server URL** in Settings. A deployment can also set it once server-side, in Stash's own plugin settings for binge, and every browser will pick it up.

**Where binge will send your Stash API key.** That key opens your whole library, so binge is picky about the daemon it hands the key to. It goes to loopback, a LAN or private address, a tailnet host, a `.local` or `.internal` name, or a bare machine name, on either http or https. It goes to a public host only over https, and only when that host either shares a domain with the Stash page you are on (the ordinary reverse-proxy setup, Stash on one subdomain and the daemon on another) or is one you set yourself. Setting the URL is what marks it: typing it into Settings and putting it in Stash's plugin settings both count, so no normal setup has an extra step.

What that rules out is a daemon URL that changed without you, pointing somewhere unrelated. https alone used to be enough, which meant anything that could rewrite the setting could have the key posted to a host of its choosing. A plain-http public address still gets the request, but without the key and with one warning in the console, because it would otherwise travel in cleartext and sit in access logs and browser history. ("Send to forage" is stricter still, being a deliberate action rather than background polling: it refuses outright and says why.)

The Settings card names the host it is sending to, above the credential fields, so you can check where your cookies are going at the moment you paste them. If you want a daemon reachable from the open internet, put it behind https; a Tailscale Funnel URL is the easy answer and needs no confirmation.

---

## Mobile

At ≤720px:

- **Bottom nav** replaces the top tab bar, five slots, IG-style icons, auto-hides on reel scroll-down.
- **Floating chrome**: home/burger top-right on Home, filter pill on For You.
- **Menu page** lists Saved + Settings as cards.
- Sheets use Stash's native bottom-sheet pattern with detents. `safe-area-inset-bottom` respected.

<p align="center">
  <img src="screenshots/mobile-home.webp" width="30%" alt="Home on a phone: stories row, feed card, bottom nav" />
  <img src="screenshots/mobile-explore.webp" width="30%" alt="Explore on a phone: search, tag chips, scene grid" />
</p>

---

## Companion plugin integrations

Detected at runtime, install whichever you want; binge degrades gracefully when they're absent.

| Plugin                                                                              | What it adds                                                                                               |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [Refract](https://github.com/ordureconnoisseur/stash-refract)                       | Tints binge's accent to match your refract palette (opt-in toggle)                                         |
| [stash-multiview](https://github.com/ordureconnoisseur/stash-multiview)             | 4-cell grid button in the action stack, tap to queue, hold to open                                         |
| [stash-advanced-rating](https://github.com/ordureconnoisseur/stash-advanced-rating) | Per-criterion 0–5 rating modal in reel + profile                                                           |
| stash-scribe (not public yet)                                                       | Scribe pencil → LLM-powered review writing                                                                 |
| [binge-server](https://github.com/ordureconnoisseur/binge-server)                   | Reddit, X and PornHub posts, and Save to Stash (separate Go daemon, installable from Settings)             |
| forage (not public yet)                                                             | "Send to forage" on discovery scenes, adding them to that daemon's watchlist. Hidden until you set its URL |

<p align="center"><img width="560" src="screenshots/rating.webp" alt="Per-criterion rating modal from stash-advanced-rating, opened inside the reel" /></p>

With [stash-advanced-rating](https://github.com/ordureconnoisseur/stash-advanced-rating) installed, the star in the action stack opens its per-criterion modal without leaving the reel. binge writes the same score tags that plugin does, so the two stay in step.

---

## Install

Add this URL as a source in **Stash → Settings → Plugins → Available Plugins → Add Source**:

```
https://ordureconnoisseur.github.io/plugins/main/index.yml
```

Install **Binge** from the list. An infinity-symbol button appears in Stash's main nav, click it.

### Manual

```bash
unzip binge-vX.Y.Z.zip -d ~/.stash/plugins/binge/
# then: Stash → Settings → Plugins → Reload Plugins
```

That's the whole install. The optional [binge-server](#binge-server-optional) daemon is a separate step, and you can start it from binge's Settings page whenever you want it.

Preferences live in `localStorage` under `binge.*`. The only things binge writes into Stash's own config are its `serverUrl` (after a successful daemon install, so other browsers find it) and the multiview queue, which is shared with the multiview plugin by design.

---

## Settings

Open binge → ⋯ → Settings (desktop) or Menu → Settings (mobile).

<p align="center"><img width="720" src="screenshots/settings.webp" alt="Settings page" /></p>

| Setting                      | Default                    | Notes                                                                                                        |
| ---------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Genders to surface           | All five                   | Drives the discovery feed + Discover Performers row. Nothing is hidden that you haven't unticked here.       |
| Stream type                  | Auto                       | Auto / Direct / MP4 / WebM / HLS                                                                             |
| Show galleries in feed       | On                         | Mix galleries into Home                                                                                      |
| Recent window                | 30 days                    | How far back "new" means. 7 / 14 / 30 / 60 / 90                                                              |
| Include StashDB new releases | On                         | In stories + Home. No-op without a StashDB API key.                                                          |
| Mix StashDB into profiles    | Off                        | Also flip-able per-profile from the scenes-heading pill                                                      |
| Include Reddit posts         | On                         | Needs binge-server. Silent no-op otherwise.                                                                  |
| Include X (Twitter) media    | On                         | Needs binge-server and X cookies. Fetched on demand when you open a profile.                                 |
| Include PornHub videos       | On                         | Needs binge-server. Stories row + profile scenes grid.                                                       |
| binge-server                 | n/a                        | Install card while no daemon answers; status, Reddit login and X login once one does.                        |
| binge-server URL             | `http://<stash host>:7878` | Derived from the address you're browsing Stash on, not hardcoded to localhost. Override for a remote daemon. |
| forage server URL            | empty                      | Optional. Blank keeps "Send to forage" hidden. Same key rule as above, but refuses the send with an error.   |
| forage watch quality         | Any                        | What a queued watch waits for: any / 720p / 1080p / 4k                                                       |
| Follow refract accent        | Off                        | Mirror refract's accent palette into binge                                                                   |
| Privacy blur                 | Off                        | Blurs every image and video app-wide so the UI can be screen-shared or captured safely. `\|` hotkey.         |
| Auto-scroll                  | Off                        | Advance to next scene when current ends (reel ⋯ menu)                                                        |
| Show debug overlay           | Off                        | Per-slide debug HUD; `\` hotkey in reel                                                                      |

---

## Architecture

- **Vite + React 19 + TypeScript** bundled to a single-file SPA (`dist/index.html`) that Stash serves from `/plugin/binge/assets/index.html`. `binge.entry.js` injects the nav button through `PluginApi.patch`.
- **All Stash data via GraphQL** (`/graphql`, same-origin cookie auth). binge has no backend of its own; binge-server is optional and separate, and binge authenticates to it with your Stash API key, but only over https or to a local/tailnet address (see below).
- **Server-side seeding**: `serverUrl` and `forageUrl` can be set once in Stash's plugin settings for binge, and every browser picks them up on first load. A value you type in Settings always wins.
- **Daemon install as a plugin task**: `binge-install.py` (standard library only) runs on the Stash host via `runPluginTask`, because a browser can't install software.
- **StashDB direct**: queries `https://stashdb.org/graphql` with the user's API key (read from Stash's stashbox config). 12h localStorage cache.
- **Hash routing**: `#/home`, `#/foryou`, `#/explore`, `#/following`, `#/saved`, `#/settings`, `#/menu`, `#/p/<id>`, `#/sdbp/<id>`. Direct deep-links + browser back.
- **Runtime plugin detection**: ASR / scribe / multiview / refract presence queried at boot, gated through React context.

---

## Development

```bash
git clone https://github.com/ordureconnoisseur/binge.git
cd binge
npm install
npm run dev          # Vite dev (SPA only, no Stash data)
npm run build        # tsc -b + produces dist/index.html
npm test             # Vitest unit suite (no Stash needed)
npm run test:watch   # the same, watching
npm run lint         # eslint
npm run format       # Prettier, pinned config
npm run smoke        # browser checks against a real Stash (see below)
npm run push         # build + deploy via scripts/push.sh (write your own)
```

Stack: Vite · React 19 · TypeScript · TanStack Virtual (reel virtualization).

### Testing

`npm test` covers everything in binge that is logic rather than markup: the
rating replica and the plugin-config parser behind it, the saved-filter
transform, the chain recommender, the collections tag layer, the shared
Multiview queue, the StashDB client and its cache, the response flatteners,
the daemon-URL credential guard, the Home feed, stories and discovery hooks,
the filter modes, and the story viewer's navigation. Around 280 tests, no
Stash needed, a few seconds to run. CI runs it alongside lint, formatting and
the build on every push.

`npm run smoke` is the other half, and needs a real Stash:

```bash
STASH_API_KEY=... npm run smoke          # defaults to http://localhost:9999
BINGE_URL=http://nas:9999 npm run smoke  # or point it somewhere else
```

It drives headless Chrome over the DevTools protocol and checks what unit
tests structurally cannot: that the plugin mounts inside Stash, that each
route renders against a real library, and that the reel genuinely plays, by
watching a video's `currentTime` advance in a real decoder. It is read-only,
so it never likes, rates, saves or queues anything, and it exits non-zero so
it can gate a deploy.

Minimal `scripts/push.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
scp binge.yml dist/binge.entry.js dist/index.html \
    user@host:'/path/to/stash/plugins/binge/'
```

---

## Support

Free, and staying that way. If it has earned a place in your setup and you feel like
chipping in, there is [GitHub Sponsors](https://github.com/sponsors/ordureconnoisseur)
and [Ko-fi](https://ko-fi.com/ordureconnoisseur).

Current goal: an Apple Developer Program membership (99 USD/year). That is the one
thing standing between the iOS ports of binge and multiview and a build that lasts
longer than seven days on someone else's phone.

## License

AGPL-3.0. See [LICENSE](./LICENSE). (Matches Stash's own license.)

<!-- screenshots/ are WebP, captured 2026-08-14 against a throwaway Stash
     with binge's placeholder mode on: an invented cast and procedural
     gradient artwork, so nothing real is in them. WebP because these are
     flat UI captures and it costs ~40x less than PNG for the same
     picture (595 KB for all fourteen).

     STILL MISSING, and all for the same reason: placeholder mode switches
     StashDB and the social integrations off, so these surfaces have no
     data to show and cannot be captured without real content:
       discovery-card · profile-stashdb · profile-mixin · other-links-popup
       explore-discover-bar · follow-modal · add-scene-modal · hovercard

     To capture any of them, blurred, against a real library:
       git revert --no-commit 25b9709   (restores placeholder mode; expect
       conflicts in collections.ts, SceneSlide.tsx and useFeed.ts, and the
       demo rows need the current RecentSceneRow shape)
     then drive headless Chrome over CDP with binge.showcaseBlur set. Scope
     the Stash API key to Stash's own origin with Fetch.enable, a global
     extra header goes to stashdb.org too, which 401s it and makes every
     StashDB feature look broken.
-->
