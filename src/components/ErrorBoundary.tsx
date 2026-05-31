import { Component, type ErrorInfo, type ReactNode } from "react";

// Catches render-time throws so a single bad component (e.g. an
// unexpected scene/StashDB shape slipping past a null guard) shows a
// recoverable message instead of unmounting the whole SPA to a blank
// screen inside Stash.
interface Props {
    children: ReactNode;
}
interface State {
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    state: State = { error: null };

    static getDerivedStateFromError(error: Error): State {
        return { error };
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error("[binge] render error:", error, info.componentStack);
    }

    render() {
        if (this.state.error) {
            return (
                <div
                    role="alert"
                    style={{
                        position: "fixed",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.9rem",
                        padding: "2rem",
                        textAlign: "center",
                        background: "#0a0a0a",
                        color: "rgba(255,255,255,0.92)",
                        fontFamily:
                            "-apple-system, BlinkMacSystemFont, system-ui, sans-serif",
                    }}
                >
                    <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>
                        binge hit an error
                    </div>
                    <div
                        style={{
                            fontSize: "0.85rem",
                            color: "rgba(255,255,255,0.55)",
                            maxWidth: "32rem",
                        }}
                    >
                        {this.state.error.message || "Unexpected render error."}
                    </div>
                    <button
                        type="button"
                        onClick={() => window.location.reload()}
                        style={{
                            appearance: "none",
                            border: "1px solid rgba(255,255,255,0.25)",
                            background: "rgba(255,255,255,0.08)",
                            color: "#fff",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 600,
                            padding: "0.5rem 1.1rem",
                            borderRadius: "999px",
                        }}
                    >
                        Reload binge
                    </button>
                </div>
            );
        }
        return this.props.children;
    }
}
