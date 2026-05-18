// binge.entry.js — runs inside Stash's main SPA, not the reel app itself.
// Registers a "binge" nav button that opens /plugin/binge/index.html in a
// new tab. The reel SPA there owns its own React tree (this file just
// hooks the host's MainNavBar).
(function () {
    const PluginApi = window.PluginApi;
    if (!PluginApi) return;

    const React = PluginApi.React;
    const REEL_PATH = "/plugin/binge/index.html";

    PluginApi.patch.instead("MainNavBar.MenuItems", function (props, _, original) {
        const existing = original(props);
        const bingeLink = React.createElement(
            "a",
            {
                key: "binge-nav",
                className: "nav-utility nav-link",
                href: REEL_PATH,
                target: "_blank",
                rel: "noopener noreferrer",
                title: "binge",
                style: { fontWeight: 600 },
            },
            "binge"
        );
        return [].concat(existing, [bingeLink]);
    });
})();
