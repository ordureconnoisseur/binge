import { useEffect, useState } from "react";
import { Reel } from "./components/Reel";
import { FilterProvider } from "./filter/FilterContext";
import { FilterBar } from "./filter/FilterBar";

// Stash exposes its API at window.PluginApi when this app is loaded as a
// plugin asset. Inside the iframe-served reel SPA it's NOT available —
// we use refract detection only to decide whether to apply the bundled
// fallback token theme.
declare global {
    interface Window {
        PluginApi?: unknown;
    }
}

function App() {
    const [refractActive, setRefractActive] = useState<boolean>(false);

    useEffect(() => {
        // Cross-window detection: refract is loaded in the main Stash SPA,
        // not in this iframe. Try the parent window when accessible; fall
        // back to checking our own body (no-op for now, allows local dev).
        try {
            const parentBody = window.parent?.document?.body;
            if (parentBody?.classList.contains("stash-liquid-glass")) {
                setRefractActive(true);
                return;
            }
        } catch {
            // Cross-origin parent — ignore, fall through to local check.
        }
        if (document.body.classList.contains("stash-liquid-glass")) {
            setRefractActive(true);
        }
    }, []);

    return (
        <FilterProvider>
            <div className={refractActive ? "binge-app refract" : "binge-app"}>
                <FilterBar />
                <Reel />
            </div>
        </FilterProvider>
    );
}

export default App;
