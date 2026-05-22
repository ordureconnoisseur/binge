# binge — project notes for future AI sessions

binge is a Stash plugin (TikTok/Reels-style reel + IG-style stories).
Vite + React + TypeScript SPA bundled to a single `dist/index.html`.
Push to PC's Stash via `npm run push:pc`.

## Quick orientation

- Source: `src/`
- Entry: `binge.entry.js` (Stash plugin shim that injects the nav button)
- Reel: `src/components/Reel.tsx` and `src/components/SceneSlide.tsx`
- Home: `src/tabs/Home.tsx`, `src/home/*`
- Performer profile: `src/performer/PerformerProfile.tsx`
- Stash GraphQL client: `src/api/queries.ts`, `src/api/mutations.ts`
- binge-server (Go daemon): `/Users/ethork/binge-server`, deployed via Docker on the mini

## Replicas of ASR / APR rating systems (DO NOT remove without coordination)

`src/rating/` re-implements the data model of two of the user's other
plugins so binge can render their rating modal natively (inline UX
in the reel + performer profile) instead of farming it out to those
plugins' own DOM-injected modals.

The plugins:
- **ASR** = Advanced Scene Rating · source at `/Users/ethork/stash-advanced-scene-rating/custom-rating-ui.js`
- **APR** = Advanced Performer Rating · source at `/Users/ethork/stash-advanced-performer-rating/performer-rating-ui.js`

binge does NOT load their JS. It speaks to the same:
- **Plugin config** stored under Stash's `configuration.plugins[<id>]`
- **Tag scheme**: `<criterion-name> ★: <0-5>` (matches `SCORE_TAG_PATTERN` in `src/rating/types.ts`)
- **Mutations**: standard `sceneUpdate` / `performerUpdate` with new `tag_ids`
- The plugins' Python `Scene.Update.Post` / `Performer.Update.Post` hooks then recompute `rating100` server-side. binge never writes `rating100` directly.

### Tag-creation policy

binge **does not auto-create** score tags. The plugins' settings panels
own the parent-tag hierarchy (under `Advanced Rating System` /
`Advanced Performer Rating`), so creating tags from outside that path
would leak orphaned root-level tags into the user's tag tree. If a
score tag doesn't exist when the modal tries to apply it, the modal
surfaces a yellow "open the plugin's settings panel once to
initialize" warning and refuses to write.

### Rating precision

`src/rating/precision.ts` queries Stash's `configuration.ui
.ratingSystemOptions` and maps the same precision values ASR/APR use:
`FULL→20, HALF→10, QUARTER→5, TENTH→1, DECIMAL→1`. The modal passes
this through to `computeRating100` so the preview snaps to the same
increments the server-side hook will write.

### When ASR or APR change upstream, re-verify these in binge:

| What changed in ASR/APR | What to check in binge |
|-|-|
| TAG_SUFFIX (currently ` ★`) | `src/rating/types.ts` — `TAG_SUFFIX`, `SCORE_TAG_PATTERN` |
| New config key prefix (currently `apr_*` in both plugins) | `src/rating/config.ts` — all `apr_<…>` lookups |
| Default criteria / groups | `src/rating/config.ts` — `ASR_DEFAULT_*` and `APR_DEFAULT_*` |
| Rating100 formula | `src/rating/ratings.ts` — `computeRating100` (used for the modal's preview; the plugin hook is the real source of truth) |
| Score range moves off 0–5 | Every star UI, the regex, the preview formula |
| Tag-name encoding (e.g. plugin starts using a different separator) | `SCORE_TAG_PATTERN`, `scoreTagName` |

The replicas only need to be **read-compatible** with the plugins —
both should be able to read tags the other wrote. The hooks own the
final `rating100`, so as long as the tags conform to the regex the
plugins will keep computing correctly.

### Plugin detection

`src/plugins/PluginContext.tsx` queries `plugins { id enabled }` once
at boot. The relevant hooks:
- `useHasASR()` — gates the criterion-rating modal in the reel
- `useHasAPR()` — gates the criterion-rating modal in performer profile
- Without these, binge falls back to basic `rating100` writes (Rate strip in the action stack; no rating UI on performer profile)

## binge-server (Reddit pipeline)

See `/Users/ethork/.claude/projects/-Users-ethork/memory/project_binge_server.md`
for the full backend story. Quick version: Go daemon on the mini polls
Reddit through a Mullvad NL exit (Tailscale Funnel for public HTTPS),
returns posts that get rendered in the per-performer story bubbles.

## Build + deploy

```bash
npm run push:pc   # tsc -b && vite build && scp to PC's Stash plugin dir
```

Source for binge-server is at `/Users/ethork/binge-server` — sync to
mini via `rsync ... mini:/Users/trevorkmarshall/Docker/binge-server/binge-server-src/`,
then `docker compose up -d --build` on mini.
