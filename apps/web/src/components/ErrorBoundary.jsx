import { Component } from "react";
import { Btn } from "@rempeyek/ui";

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error("[ErrorBoundary] Caught unhandled React error:", error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetStorage = () => {
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      const errorMessage = this.state.error?.message || String(this.state.error);
      return (
        <div
          style={{
            minHeight: "100vh",
            backgroundColor: "#0b0f17",
            color: "#e2e8f0",
            fontFamily: "system-ui, -apple-system, sans-serif",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              maxWidth: "600px",
              width: "100%",
              backgroundColor: "rgba(18, 24, 38, 0.95)",
              border: "1px solid rgba(255, 255, 255, 0.12)",
              borderRadius: "12px",
              padding: "32px",
              boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
              backdropFilter: "blur(12px)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "28px" }}>⚠️</span>
              <div>
                <h1 style={{ margin: 0, fontSize: "20px", fontWeight: "600", color: "#f8fafc" }}>
                  Rempeyek Agent OS Recovery
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#94a3b8" }}>
                  An unexpected error occurred in the workspace interface.
                </p>
              </div>
            </div>

            <div
              style={{
                backgroundColor: "#06090e",
                border: "1px solid rgba(255,255,255,0.08)",
                borderRadius: "8px",
                padding: "12px 16px",
                margin: "20px 0",
                fontSize: "13px",
                fontFamily: "monospace",
                color: "#f43f5e",
                overflowX: "auto",
                whiteSpace: "pre-wrap",
                maxHeight: "160px",
              }}
            >
              {errorMessage}
            </div>

            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <Btn variant="dim" onClick={this.handleResetStorage}>
                Reset Cache & Reload
              </Btn>
              <Btn variant="primary" onClick={this.handleReload}>
                Reload Workspace
              </Btn>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
