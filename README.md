# binge

Vertical reel viewer for [Stash](https://github.com/stashapp/stash) — TikTok-style scene browsing with live filter chips. Studies `secondfolder/stash-tv` for plugin patterns; runtime-detects the [Refract](https://github.com/ordureconnoisseur/stash-refract) theme to inherit its liquid-glass styling.

## Status

v0 scaffold. Plugin shell (nav button + fullscreen SPA route) works; reel player + filters not yet implemented.

## Development

```bash
npm install
npm run dev        # standalone Vite dev server (no PluginApi)
npm run build      # build dist/index.html (single-file) + dist/binge.entry.js
npm run push:pc    # build, then scp the three files to pc:.stash/plugins/binge/
```

After `push:pc`, in Stash on the PC: Settings → Plugins → Reload Plugins, then hard-refresh (Ctrl+Shift+R).

## Plugin layout on the host

The Stash plugin folder needs exactly three files at its root:

```
binge/
├── binge.yml           # plugin manifest
├── binge.entry.js      # runs inside Stash SPA, adds the nav button
└── index.html          # the reel SPA (React inlined; loaded fullscreen)
```

`binge.entry.js` hooks `PluginApi.patch.instead("MainNavBar.MenuItems")` to inject a "binge" link that opens `/plugin/binge/index.html` in a new tab. The reel app owns its own React tree there.
