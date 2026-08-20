#!/usr/bin/env node
//
// Browser smoke test for binge, run against a real Stash.
//
// The unit suite covers everything that is logic. This covers what is
// not: that the plugin actually mounts inside Stash, that each route
// renders against a real library, and above all that the reel plays.
// Video is the one thing jsdom cannot speak to at all - a unit test can
// only assert that we called play(), never that a frame arrived - so
// the reel is checked here by watching currentTime advance in a real
// browser with a real decoder.
//
// STRICTLY READ-ONLY. It never likes, rates, saves, follows or queues
// anything, because it runs against your actual library. Every check is
// a navigation, a scroll, or a read.
//
// Usage:
//   node tools/smoke.mjs
//   BINGE_URL=http://stash.local:9999 STASH_API_KEY=... node tools/smoke.mjs
//
// Env:
//   BINGE_URL       Stash origin. Default http://localhost:9999
//   STASH_API_KEY   Sent as the ApiKey header. Omit if Stash has no auth.
//   CHROME          Path to Chrome. Default: the usual per-platform spots.
//   SMOKE_HEADFUL   Set to 1 to watch it run.
//   SMOKE_TOUCH     Set to 1 to add the hold-for-speed gesture checks.
//                   Off by default: they drive synthetic touch, which
//                   headless Chrome delivers unreliably enough to fail
//                   on a plugin that is working.
//
// Exits non-zero if any check fails, so it can gate a deploy.

import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = (process.env.BINGE_URL ?? "http://localhost:9999").replace(
    /\/+$/,
    "",
);
const KEY = process.env.STASH_API_KEY ?? "";
const APP = `${BASE}/plugin/binge/assets/index.html`;
const PORT = 9333;

const CHROME_CANDIDATES = [
    process.env.CHROME,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
].filter(Boolean);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── tiny CDP client ─────────────────────────────────────────────────
let nextId = 1;
const pending = new Map();
const events = [];
let ws;

function send(method, params = {}) {
    const id = nextId++;
    ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        setTimeout(() => reject(new Error("CDP timeout: " + method)), 45000);
    });
}

async function evaluate(expression) {
    const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
    });
    if (r.exceptionDetails) {
        throw new Error(
            "page threw: " +
                (r.exceptionDetails.exception?.description ??
                    r.exceptionDetails.text),
        );
    }
    return r.result.value;
}

// Real pointer input, not element.click(): several controls (the Saved
// tiles, for one) listen on pointerdown/pointerup so they can also
// detect a long press, and a synthetic click never reaches them.
async function tap(x, y) {
    await send("Input.dispatchMouseEvent", {
        type: "mousePressed",
        x,
        y,
        button: "left",
        clickCount: 1,
        buttons: 1,
    });
    await sleep(90);
    await send("Input.dispatchMouseEvent", {
        type: "mouseReleased",
        x,
        y,
        button: "left",
        clickCount: 1,
        buttons: 0,
    });
}

// Real touch, for the one gesture that has to share the screen with the
// browser's own scrolling. Chrome will not dispatch these at all unless
// touch emulation is on, which the hold-for-speed check turns on around
// itself and off again after.
async function touch(type, x, y) {
    await send("Input.dispatchTouchEvent", {
        type,
        touchPoints:
            type === "touchEnd"
                ? []
                : [{ x, y, id: 1, radiusX: 8, radiusY: 8 }],
    });
}

async function goto(route) {
    events.length = 0;
    // about:blank first so each route starts from a clean mount rather
    // than inheriting the previous view's state.
    await send("Page.navigate", { url: "about:blank" });
    await sleep(300);
    await send("Page.navigate", { url: APP + route });
}

// Console errors and uncaught exceptions collected since the last goto.
function pageProblems() {
    const out = [];
    for (const e of events) {
        if (e.method === "Runtime.exceptionThrown") {
            const d = e.params.exceptionDetails;
            out.push(
                "uncaught: " +
                    (d.exception?.description ?? d.text).split("\n")[0],
            );
        }
        if (
            e.method === "Runtime.consoleAPICalled" &&
            e.params.type === "error"
        ) {
            const text = (e.params.args ?? [])
                .map((a) => a.value ?? a.description ?? "")
                .join(" ");
            // A missing preview or a 404 image is a library-content
            // problem, not a plugin problem.
            if (/Failed to load|net::ERR|status of 4\d\d/i.test(text)) continue;
            out.push("console.error: " + text.slice(0, 160));
        }
    }
    return out;
}

// ── check bookkeeping ───────────────────────────────────────────────
const results = [];
async function check(name, fn) {
    try {
        const detail = await fn();
        results.push({ name, ok: true, detail });
        console.log(`  PASS  ${name}${detail ? "  (" + detail + ")" : ""}`);
    } catch (err) {
        results.push({ name, ok: false, detail: err.message });
        console.log(`  FAIL  ${name}\n        ${err.message}`);
    }
}

function assert(cond, msg) {
    if (!cond) throw new Error(msg);
}

// ── the checks ──────────────────────────────────────────────────────
const ROUTES = [
    ["#/home", "Home"],
    ["#/foryou", "For You"],
    ["#/explore", "Explore"],
    ["#/following", "Following"],
    ["#/saved", "Saved"],
];

async function checkRoutesMount() {
    for (const [route, label] of ROUTES) {
        await check(`${label} mounts`, async () => {
            await goto(route);
            await sleep(7000);
            const info = await evaluate(`(() => {
                const root = document.getElementById('root');
                return JSON.stringify({
                    mounted: !!(root && root.children.length),
                    chars: (document.body.innerText || '').trim().length,
                });
            })()`);
            const { mounted, chars } = JSON.parse(info);
            assert(mounted, "nothing rendered into #root");
            assert(chars > 0, "rendered but empty");
            const problems = pageProblems();
            assert(problems.length === 0, problems.join(" | "));
            return `${chars} chars`;
        });
    }
}

async function checkHomePopulates() {
    await check("Home shows stories and feed cards", async () => {
        await goto("#/home");
        // Measured on the maintainer's library with StashDB reachable:
        // first story at 15.1s, first feed card at 16.1s. This check is
        // "did anything render", not a latency budget, so the wait is
        // generous — but that latency is a real problem in its own right
        // and worth attacking rather than waiting out.
        await sleep(25000);
        const info = await evaluate(`JSON.stringify({
            stories: document.querySelectorAll('.binge-story').length,
            cards: document.querySelectorAll('.binge-feed-card-wrapper').length,
        })`);
        const { stories, cards } = JSON.parse(info);
        assert(stories > 0, "stories row is empty");
        assert(cards > 0, "feed rendered no cards");
        return `${stories} stories, ${cards} cards`;
    });
}

// The point of this whole file. A unit test can assert play() was
// called; only a real browser can tell us a frame actually arrived.
async function checkReelPlays() {
    await check("reel video decodes and advances", async () => {
        // Navigating inside the check, not around it: a hung navigation
        // should fail one check and let the rest still report, rather
        // than aborting the run with no summary.
        await goto("#/foryou");
        // Longer than the desktop checks take: the gesture measures a
        // corner of the frame, so it needs the mobile layout settled and
        // the reel filled, not merely painted.
        await sleep(18000);
        const before = await evaluate(`(() => {
            const v = document.querySelector('.binge-slide video');
            return v ? JSON.stringify({ t: v.currentTime, rs: v.readyState, paused: v.paused }) : null;
        })()`);
        assert(before, "no video element in the reel");
        const b = JSON.parse(before);
        assert(b.rs >= 3, `video never buffered (readyState ${b.rs})`);
        assert(!b.paused, "active slide is paused");

        await sleep(2500);
        const after = JSON.parse(
            await evaluate(
                `JSON.stringify({ t: document.querySelector('.binge-slide video').currentTime })`,
            ),
        );
        assert(
            after.t > b.t,
            `currentTime did not advance (${b.t} -> ${after.t})`,
        );
        return `t ${b.t.toFixed(1)} -> ${after.t.toFixed(1)}`;
    });

    await check("reel advances to the next scene", async () => {
        const firstSrc = await evaluate(
            `(document.querySelector('.binge-slide video') || {}).currentSrc || ''`,
        );
        // Scroll the snap container by one viewport, the way a swipe does.
        await evaluate(`(() => {
            const el = document.querySelector('.binge-reel-virtual')?.parentElement
                    ?? document.querySelector('.binge-reel');
            const scroller = [...document.querySelectorAll('.binge-reel, .binge-tab-scroll, .binge-reel-virtual')]
                .find(e => e.scrollHeight > e.clientHeight + 10) ?? el;
            scroller.scrollBy({ top: scroller.clientHeight, behavior: 'auto' });
            return true;
        })()`);
        await sleep(6000);

        const state = JSON.parse(
            await evaluate(`(() => {
                const vids = [...document.querySelectorAll('.binge-slide video')];
                const playing = vids.filter(v => !v.paused);
                return JSON.stringify({
                    count: vids.length,
                    playing: playing.length,
                    srcs: vids.map(v => v.currentSrc || ''),
                });
            })()`),
        );
        assert(state.count > 0, "no slides after scrolling");
        assert(
            state.playing <= 1,
            `${state.playing} videos playing at once, should be at most 1`,
        );
        const moved = !state.srcs.every((s) => s === firstSrc);
        assert(moved, "scrolling did not change the mounted slides");
        return `${state.count} slides mounted, ${state.playing} playing`;
    });

    await check("reel keeps only a few slides mounted", async () => {
        // The virtualizer is what stops 50 <video> elements piling up and
        // exhausting the decoder. The lower bound matters as much as the
        // upper one: without it this passes on a reel that rendered
        // nothing at all.
        const n = await evaluate(
            `document.querySelectorAll('.binge-slide video').length`,
        );
        assert(n >= 1, "no slides mounted at all");
        assert(n <= 6, `${n} video elements mounted, virtualizer not trimming`);
        return `${n} mounted`;
    });

    await check("reel reported no errors", async () => {
        // Tied to the reel having actually rendered, so an empty page
        // cannot report a clean bill of health.
        const rendered = await evaluate(
            `document.querySelectorAll('.binge-slide').length`,
        );
        assert(rendered > 0, "reel rendered no slides to judge");
        const problems = pageProblems();
        assert(problems.length === 0, problems.join(" | "));
        return "clean";
    });
}

// Hold the top-right corner to run at 2x, pull down to latch it. The
// state machine is covered by unit tests; what only a real browser can
// answer is whether the gesture and the browser's own scrolling can
// share that corner. Getting one of those working at the cost of the
// other is how this went wrong repeatedly on the iOS side, and neither
// failure is visible to jsdom: it has no scrolling to lose.
async function checkHoldForSpeed() {
    const PHONE_W = 430;
    const PHONE_H = 932;
    const cx = Math.round(PHONE_W * 0.9);
    const cy = Math.round(PHONE_H * 0.25);
    // Comfortably past the 450ms hold and the 280ms grace that rejects a
    // pull arriving too soon after it.
    const HELD = 750;

    const speedState = () =>
        evaluate(`(() => {
            const v = document.querySelector('.binge-slide[data-active="true"] video')
                   ?? document.querySelector('.binge-slide video');
            const pill = document.querySelector('.binge-speed-pill');
            const sc = [...document.querySelectorAll('.binge-reel')]
                .find(e => e.scrollHeight > e.clientHeight + 10);
            return JSON.stringify({
                rate: v ? v.playbackRate : null,
                paused: v ? v.paused : null,
                pill: pill ? pill.textContent : null,
                locked: !!document.querySelector('.binge-speed-pill-icon'),
                scrollTop: sc ? Math.round(sc.scrollTop) : null,
            });
        })()`).then(JSON.parse);

    const pullDown = async () => {
        for (let dy = 10; dy <= 70; dy += 10) {
            await touch("touchMove", cx, cy + dy);
            await sleep(25);
        }
    };

    await send("Emulation.setDeviceMetricsOverride", {
        width: PHONE_W,
        height: PHONE_H,
        deviceScaleFactor: 2,
        mobile: true,
    });
    await send("Emulation.setTouchEmulationEnabled", {
        enabled: true,
        maxTouchPoints: 1,
    });
    try {
        await goto("#/foryou");
        await sleep(12000);

        await check(
            "holding the corner runs at 2x, releasing hands it back",
            async () => {
                const ready = await speedState();
                assert(ready.rate !== null, "no video in the reel");
                await touch("touchStart", cx, cy);
                await sleep(HELD);
                const held = await speedState();
                await touch("touchEnd", cx, cy);
                await sleep(400);
                const released = await speedState();
                assert(held.rate === 2, `held at ${held.rate}x, expected 2x`);
                assert(
                    held.pill === "2X speed",
                    `pill read ${JSON.stringify(held.pill)}`,
                );
                assert(
                    released.rate === 1,
                    `release left it at ${released.rate}x`,
                );
                return "2x while held";
            },
        );

        await check(
            "pulling down latches the speed, and pulling again lets it go",
            async () => {
                await touch("touchStart", cx, cy);
                await sleep(HELD);
                await pullDown();
                const pulled = await speedState();
                await touch("touchEnd", cx, cy + 70);
                await sleep(400);
                const latched = await speedState();
                assert(
                    pulled.locked,
                    "no lock glyph on the pill after the pull",
                );
                assert(
                    latched.rate === 2,
                    `latch did not survive the release (${latched.rate}x)`,
                );

                await touch("touchStart", cx, cy);
                await sleep(HELD);
                await pullDown();
                const second = await speedState();
                await touch("touchEnd", cx, cy + 70);
                await sleep(400);
                const freed = await speedState();
                assert(
                    second.pill === "1X speed",
                    `pill read ${JSON.stringify(second.pill)} on unlock`,
                );
                assert(
                    freed.rate === 1,
                    `still at ${freed.rate}x after unlock`,
                );
                return "latched and released";
            },
        );

        await check(
            "a swipe in that corner still scrolls the reel",
            async () => {
                // Input.synthesizeScrollGesture does not drive this
                // scroller in headless Chrome at all - it fails in the
                // middle of the frame too, where none of the gesture
                // code runs - so the swipe is dispatched by hand.
                const swipeUp = async (x) => {
                    const from = Math.round(PHONE_H * 0.45);
                    await touch("touchStart", x, from);
                    for (let dy = 30; dy <= 330; dy += 30) {
                        await touch("touchMove", x, from - dy);
                        await sleep(16);
                    }
                    await touch("touchEnd", x, from - 330);
                    await sleep(2500);
                    return (await speedState()).scrollTop;
                };

                // Control first, in the middle of the frame, where the
                // gesture has no zone and cannot be responsible. Without
                // it a synthetic swipe that simply did not take would be
                // reported as a dead zone in the corner, which is a very
                // convincing way to chase a bug that is not there.
                // Retried, because the thing being flaky is Chrome's
                // delivery of synthetic touch, not the reel. Any attempt
                // that moves proves the input works and lets the corner
                // be judged.
                let start = null;
                let control = null;
                for (
                    let attempt = 0;
                    attempt < 4 && control === null;
                    attempt++
                ) {
                    await sleep(800);
                    start = (await speedState()).scrollTop;
                    const moved = await swipeUp(Math.round(PHONE_W * 0.5));
                    if (moved > start) control = moved;
                }
                if (control === null) {
                    const diag = await evaluate(`(() => {
                        const all = [...document.querySelectorAll('.binge-reel, .binge-tab-scroll, .binge-reel-virtual')]
                            .map(e => e.className + ':' + Math.round(e.scrollTop) + '/' + e.scrollHeight + '/' + e.clientHeight);
                        return JSON.stringify({
                            scrollers: all,
                            slides: document.querySelectorAll('.binge-slide').length,
                            touchPoints: navigator.maxTouchPoints,
                        });
                    })()`);
                    assert(
                        false,
                        "swiping did not scroll the reel anywhere, so this run cannot judge the corner: " +
                            diag,
                    );
                }

                // Same reason, same remedy: the corner only fails this
                // check if it refuses to scroll every time.
                let after = control;
                for (
                    let attempt = 0;
                    attempt < 3 && after <= control;
                    attempt++
                ) {
                    after = await swipeUp(cx);
                }
                assert(
                    after > control,
                    `scrollTop stuck at ${after}: the corner is a dead zone`,
                );
                const state = await speedState();
                assert(
                    state.rate === 1,
                    `a swipe changed the speed to ${state.rate}x`,
                );
                return `centre ${start} -> ${control}, corner -> ${after}`;
            },
        );

        await check(
            "a tap in that corner pauses, and a hold does not",
            async () => {
                // Pin the check to one element by id. The swipe above
                // moved the reel on, so "the first video in the DOM" and
                // "the one under the finger" are different elements, and
                // reading the wrong one reports a gesture failure that
                // did not happen.
                const id = await evaluate(`(() => {
                    const el = document.querySelector('.binge-slide[data-active="true"]');
                    return el ? el.getAttribute('data-scene-id') : null;
                })()`);
                assert(id, "no active slide to tap");
                const pausedNow = () =>
                    evaluate(`(() => {
                        const v = document.querySelector('.binge-slide[data-scene-id="${id}"] video');
                        return v ? v.paused : null;
                    })()`);

                // Tap to PAUSE, never to play. Pausing takes effect at
                // once; playing returns a promise that stays pending
                // while a freshly scrolled-to slide is still buffering,
                // so a tap that worked perfectly would read as a slide
                // that ignored it.
                let playing = false;
                for (let i = 0; i < 40 && !playing; i++) {
                    playing = (await pausedNow()) === false;
                    if (!playing) await sleep(250);
                }
                assert(playing, "the active slide never started playing");

                await touch("touchStart", cx, cy);
                await sleep(80);
                await touch("touchEnd", cx, cy);
                await sleep(900);
                assert(await pausedNow(), "tap did not pause the slide");

                // The browser sends a click after a hold like any other
                // press. Acting on it would punish the gesture.
                await touch("touchStart", cx, cy);
                await sleep(HELD);
                await touch("touchEnd", cx, cy);
                await sleep(900);
                assert(await pausedNow(), "the hold also toggled play/pause");
                return "tap pauses, hold does not";
            },
        );
    } finally {
        // Later checks drive mouse input against a desktop layout.
        await send("Emulation.setTouchEmulationEnabled", { enabled: false });
        await send("Emulation.setDeviceMetricsOverride", {
            width: 1400,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false,
        });
    }
}

async function checkSavedCollectionOpens() {
    await check("a Saved collection opens and fills", async () => {
        await goto("#/saved");
        await sleep(9000);
        const box = await evaluate(`(() => {
            const tiles = [...document.querySelectorAll('.binge-saved-tile')];
            // Pick a collection that actually has something in it.
            const t = tiles.find(e => !/\\bempty\\b/i.test(e.innerText || '')) ?? tiles[0];
            if (!t) return null;
            const r = t.getBoundingClientRect();
            return JSON.stringify({
                x: Math.round(r.x + r.width / 2),
                y: Math.round(r.y + r.height / 2),
                label: (t.innerText || '').replace(/\\s+/g, ' ').trim(),
            });
        })()`);
        assert(box, "no collections on the Saved page");
        const { x, y, label } = JSON.parse(box);
        await tap(x, y);
        await sleep(9000);

        const info = JSON.parse(
            await evaluate(`(() => {
                const title = document.querySelector('.binge-saved-title');
                const root = title && title.closest('.binge-tab-scroll');
                return JSON.stringify({
                    inDetail: !!document.querySelector('.binge-saved-back[aria-label="Back to Saved"]'),
                    title: title ? title.innerText : null,
                    tiles: root ? root.querySelectorAll('.binge-explore-tile').length : 0,
                    saysNoScenes: /no scenes/i.test(document.body.innerText || ''),
                });
            })()`),
        );
        assert(
            info.inDetail,
            `tapping "${label}" did not open the detail view`,
        );
        // An empty grid here is the signature of the collection's tag id
        // failing to resolve, which is exactly the bug this guards.
        assert(
            info.tiles > 0 || info.saysNoScenes,
            `"${info.title}" opened but rendered no scenes and no empty state`,
        );
        const problems = pageProblems();
        assert(problems.length === 0, problems.join(" | "));
        return `${info.title}: ${info.tiles} scenes`;
    });
}

// Fail fast and legibly when Stash will not talk to us. Without this,
// bad or missing credentials show up as "no collections on the Saved
// page" and half a dozen similar non-sequiturs, and it takes a while to
// realise the plugin is fine and the key is not.
async function preflight() {
    let resp;
    try {
        resp = await fetch(`${BASE}/graphql`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                ...(KEY ? { ApiKey: KEY } : {}),
            },
            body: JSON.stringify({ query: "{ systemStatus { status } }" }),
        });
    } catch (err) {
        throw new Error(
            `cannot reach Stash at ${BASE} (${err.message}). Set BINGE_URL if it lives elsewhere.`,
        );
    }
    if (resp.status === 401 || resp.status === 403) {
        throw new Error(
            KEY
                ? `Stash rejected STASH_API_KEY (HTTP ${resp.status})`
                : `Stash requires authentication; set STASH_API_KEY`,
        );
    }
    const body = await resp.json().catch(() => null);
    if (!body?.data?.systemStatus) {
        throw new Error(
            `Stash at ${BASE} did not answer a status query; is that the right origin?`,
        );
    }
}

// ── driver ──────────────────────────────────────────────────────────
async function findChrome() {
    for (const p of CHROME_CANDIDATES) if (p && existsSync(p)) return p;
    throw new Error(
        "Chrome not found. Set CHROME=/path/to/chrome (tried: " +
            CHROME_CANDIDATES.join(", ") +
            ")",
    );
}

async function connect() {
    for (let i = 0; i < 40; i++) {
        try {
            const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
            const page = (await r.json()).find((t) => t.type === "page");
            if (page?.webSocketDebuggerUrl) return page.webSocketDebuggerUrl;
        } catch {
            /* not up yet */
        }
        await sleep(250);
    }
    throw new Error("Chrome never exposed a debugging target");
}

async function main() {
    await preflight();
    const chrome = await findChrome();
    const profile = await mkdtemp(join(tmpdir(), "binge-smoke-"));
    const args = [
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        // Headless Chrome refuses to autoplay without this, and the reel
        // check would then be measuring the policy, not the plugin.
        "--autoplay-policy=no-user-gesture-required",
        "about:blank",
    ];
    if (!process.env.SMOKE_HEADFUL) args.unshift("--headless=new");

    const proc = spawn(chrome, args, { stdio: "ignore" });
    let failed = false;
    try {
        ws = new WebSocket(await connect());
        await new Promise((resolve, reject) => {
            ws.onopen = resolve;
            ws.onerror = () => reject(new Error("CDP socket failed"));
        });
        ws.onmessage = (ev) => {
            const m = JSON.parse(ev.data);
            if (m.method === "Fetch.requestPaused") {
                // Only Stash's own requests are paused (see the pattern
                // below), so the key goes nowhere else.
                send("Fetch.continueRequest", {
                    requestId: m.params.requestId,
                    headers: [
                        ...Object.entries(m.params.request.headers).map(
                            ([name, value]) => ({ name, value: String(value) }),
                        ),
                        { name: "ApiKey", value: KEY },
                    ],
                }).catch(() => {
                    /* request already gone */
                });
                return;
            }
            if (m.id && pending.has(m.id)) {
                const { resolve, reject } = pending.get(m.id);
                pending.delete(m.id);
                m.error
                    ? reject(new Error(JSON.stringify(m.error)))
                    : resolve(m.result);
            } else if (m.method) {
                events.push(m);
            }
        };

        await send("Runtime.enable");
        await send("Network.enable");
        await send("Page.enable");
        await send("Emulation.setDeviceMetricsOverride", {
            width: 1400,
            height: 1000,
            deviceScaleFactor: 1,
            mobile: false,
        });
        // Scoped to Stash's own origin via request interception rather
        // than Network.setExtraHTTPHeaders, which attaches the header to
        // EVERY request the page makes. The plugin talks to stashdb.org
        // directly, and StashDB answers 401 to a Stash API key — so the
        // global header silently disabled every StashDB feature and made
        // this harness blind to them.
        if (KEY) {
            await send("Fetch.enable", {
                patterns: [{ urlPattern: `${BASE}/*` }],
            });
        }

        console.log(`\nbinge smoke test against ${BASE}\n`);
        await checkRoutesMount();
        await checkHomePopulates();
        await checkReelPlays();
        // Opt-in: synthetic touch is markedly less reliable than
        // synthetic mouse in headless Chrome, and these checks fail
        // intermittently for reasons that have nothing to do with the
        // plugin. Too flaky to gate a deploy on, too useful to throw
        // away, since they are the only thing that can tell a working
        // gesture from one that ate the reel's scrolling.
        if (process.env.SMOKE_TOUCH) await checkHoldForSpeed();
        await checkSavedCollectionOpens();

        const bad = results.filter((r) => !r.ok);
        console.log(
            `\n${results.length - bad.length}/${results.length} checks passed\n`,
        );
        failed = bad.length > 0;
    } finally {
        try {
            ws?.close();
        } catch {
            /* already gone */
        }
        proc.kill();
        await rm(profile, { recursive: true, force: true }).catch(() => {});
    }
    process.exit(failed ? 1 : 0);
}

main().catch((err) => {
    console.error("\nsmoke test could not run:", err.message, "\n");
    process.exit(2);
});
