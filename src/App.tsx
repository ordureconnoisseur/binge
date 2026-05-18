import { useEffect, useState } from "react";

// Stash exposes its API at window.PluginApi when this app is loaded as a
// plugin asset. When viewing this page in a Vite dev server it won't be
// there, so the reel falls back to a "not in Stash" placeholder.
declare global {
    interface Window {
        PluginApi?: unknown;
    }
}

function App() {
    const [hostInfo, setHostInfo] = useState<string>("detecting host…");

    useEffect(() => {
        const inStash = typeof window.PluginApi !== "undefined";
        const refractActive =
            typeof document !== "undefined" &&
            document.body.classList.contains("stash-liquid-glass");
        setHostInfo(
            inStash
                ? `running in Stash · refract ${refractActive ? "detected" : "absent"}`
                : "standalone (no PluginApi)"
        );
    }, []);

    return (
        <main className="binge-shell">
            <header className="binge-header">
                <h1>binge</h1>
                <p className="binge-host">{hostInfo}</p>
            </header>
            <section className="binge-reel-placeholder">
                <p>reel player coming next</p>
            </section>
        </main>
    );
}

export default App;
