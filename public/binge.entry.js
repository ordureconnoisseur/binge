// binge.entry.js — runs inside Stash's main SPA. Adds a "binge" nav button
// that opens the reel SPA fullscreen at /plugin/binge/assets/index.html.
//
// All user-facing settings now live inside the binge SPA itself
// (Home → burger menu → Settings). This file is intentionally minimal:
// it owns the nav-button injection only.
//
// Structure cribbed from secondfolder/stash-tv:
//   - patch.instead's 3rd arg is the Original *component*; wrap it as
//     <Original>{children}<NewBtn/></Original> to append a menu item
//   - Stash navbar uses Bootstrap-grid wrapper + .btn anchor; refract's
//     navbar CSS picks up `a.btn` and re-skins it as a square icon button
//   - <span> label gets hidden by refract's icons-only rule (font-size: 0)
(function () {
    const PluginApi = window.PluginApi;
    if (!PluginApi) return;
    const React = PluginApi.React;
    const REEL_PATH = "/plugin/binge/assets/index.html";

    // Infinity symbol — single path, viewBox 0 0 512 512, currentColor for theming
    const INFINITY_PATH =
        "M501.98,206.15c-9.769-23.023-25.998-42.56-46.458-56.389c-10.181-6.873-21.446-12.34-33.536-16.068c-12.009-3.809-24.842-5.798-38.088-5.798c-16.982,0-33.294,3.316-48.197,9.365c-1.246,0.492-2.402,0.986-3.558,1.568c-13.416,5.879-25.675,14.16-36.188,24.017c-3.396,3.227-6.623,6.623-9.858,10.432c-5.709,6.542-11.588,14.079-17.305,21.696c-1.157,1.568-2.402,3.226-3.558,4.804c-3.146,4.302-33.212,48.358-38.509,56.226c-2.652,3.97-5.798,8.442-9.195,13.327c-0.744,1.076-1.568,2.24-2.393,3.396c-5.636,8.031-11.928,16.481-17.726,23.937c-2.895,3.72-5.798,7.197-8.281,10.1c-2.563,2.976-4.884,5.378-6.542,6.954c-7.116,6.704-15.486,12.171-24.672,15.899c-9.194,3.728-19.214,5.798-29.816,5.798c-7.286,0-14.322-0.996-20.944-2.815c-3.396-0.913-6.712-2.07-9.939-3.477c-14.248-5.968-26.419-16.068-34.95-28.74c-4.302-6.372-7.699-13.327-10.019-20.783c-2.233-7.456-3.558-15.316-3.558-23.597c0-11.014,2.24-21.365,6.21-30.892c6.049-14.24,16.149-26.329,28.821-34.942c6.372-4.31,13.326-7.618,20.782-9.939c7.448-2.321,15.316-3.638,23.597-3.638c10.602,0.08,20.622,2.07,29.816,5.79c9.187,3.808,17.556,9.194,24.672,15.898c1.658,1.577,3.979,4.059,6.542,6.962c4.472,5.216,9.769,11.92,15.074,18.964c2.07,2.814,4.14,5.628,6.21,8.523c7.949-11.588,21.858-31.959,29.144-42.48c-1.237-1.658-2.482-3.307-3.72-4.965c-3.316-4.23-6.631-8.281-9.938-12.009c-3.316-3.809-6.462-7.205-9.858-10.432c-11.426-10.772-24.922-19.545-39.746-25.586c-14.904-6.049-31.222-9.365-48.196-9.365c-17.637,0-34.53,3.566-49.927,10.108c-23.022,9.688-42.487,25.918-56.316,46.369c-6.873,10.19-12.332,21.527-16.141,33.536C1.989,229.997,0,242.75,0,256.004c0,17.637,3.558,34.53,10.02,49.846c9.768,23.104,25.998,42.569,46.369,56.397c10.27,6.874,21.535,12.332,33.624,16.141c12.008,3.728,24.842,5.717,38.088,5.717c16.974,0,33.293-3.316,48.196-9.356c14.824-6.049,28.239-14.824,39.666-25.506l0.08-0.081c3.397-3.146,6.543-6.631,9.858-10.44c5.709-6.542,11.588-14.071,17.305-21.689c1.157-1.577,2.402-3.154,3.558-4.723c3.146-4.391,44.307-64.758,47.696-69.642c0.752-1.076,1.577-2.232,2.401-3.396c5.637-7.95,11.928-16.48,17.726-23.928c2.895-3.728,5.798-7.206,8.281-10.101c2.564-2.984,4.885-5.386,6.542-6.962c7.116-6.704,15.486-12.09,24.673-15.898c2.24-0.906,4.472-1.649,6.792-2.402c7.286-2.15,14.984-3.307,23.023-3.388c11.013,0.08,21.446,2.232,30.882,6.291c14.241,5.96,26.42,16.06,34.943,28.732c4.31,6.38,7.706,13.335,10.019,20.782c2.321,7.456,3.566,15.324,3.566,23.605c0,11.014-2.24,21.446-6.21,30.883c-6.049,14.24-16.149,26.419-28.821,34.942c-6.372,4.31-13.326,7.707-20.782,9.939c-7.367,2.321-15.316,3.648-23.597,3.648c-10.602,0-20.622-2.07-29.816-5.798c-9.187-3.728-17.557-9.195-24.673-15.899c-1.658-1.577-3.979-4.059-6.542-6.954c-4.472-5.135-9.776-11.928-15.074-18.963c-2.15-2.815-4.221-5.718-6.291-8.613c-0.663,0.994-1.326,1.99-2.07,3.065c-13.666,20.039-22.279,32.71-26.994,39.576c1.237,1.658,2.483,3.235,3.72,4.893c3.316,4.221,6.631,8.281,9.938,12c3.234,3.808,6.462,7.294,9.858,10.44c11.426,10.763,24.923,19.538,39.746,25.587c14.904,6.04,31.215,9.356,48.197,9.356c17.636,0,34.53-3.558,49.846-10.019c23.103-9.769,42.56-25.999,56.396-46.458c6.866-10.181,12.421-21.446,16.141-33.536C510.01,282.083,512,269.25,512,256.004C512,238.367,508.442,221.474,501.98,206.15z";

    function InfinityIcon() {
        return React.createElement(
            "svg",
            {
                className: "nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0",
                xmlns: "http://www.w3.org/2000/svg",
                viewBox: "0 0 512 512",
                width: "1em",
                height: "1em",
                fill: "currentColor",
                "aria-hidden": "true",
            },
            React.createElement("path", { d: INFINITY_PATH })
        );
    }

    // Match Stash's native MainNavbar item structure exactly:
    //   <Nav.Link as="div" className="col-4 ...">       (wrapper)
    //     <Button className="minimal p-4 ...">          (renders as <button>)
    //       <Icon className="nav-menu-icon ..." />
    //       <span>label</span>
    //     </Button>
    //   </Nav.Link>
    // Using <button> + onClick instead of <a href> matches native element
    // type so refract's icon-button rules apply identically.
    function BingeNavButton() {
        const handleClick = function (e) {
            e.preventDefault();
            window.open(REEL_PATH, "_blank", "noopener,noreferrer");
        };
        return React.createElement(
            "div",
            {
                "data-rb-event-key": REEL_PATH,
                className: "nav-link col-4 col-sm-3 col-md-2 col-lg-auto",
                id: "BingeNavButton",
            },
            React.createElement(
                "button",
                {
                    type: "button",
                    onClick: handleClick,
                    className:
                        "minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center btn btn-primary",
                    title: "Binge",
                    "aria-label": "Binge",
                },
                // Icon-only — no label span. Native nav items hide their
                // span via refract's CSS; we just don't render one.
                React.createElement(InfinityIcon)
            )
        );
    }

    PluginApi.patch.instead(
        "MainNavBar.MenuItems",
        function (props, _, Original) {
            const { children } = props;
            const rest = Object.assign({}, props);
            delete rest.children;
            return [
                React.createElement(
                    Original,
                    rest,
                    children,
                    React.createElement(BingeNavButton, { key: "binge-nav" })
                ),
            ];
        }
    );
})();
