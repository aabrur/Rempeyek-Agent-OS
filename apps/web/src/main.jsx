import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@rempeyek/design-system/index.css";
import "@rempeyek/theme-engine/themes.css";
import { ErrorBoundary } from "./components/ErrorBoundary";
import App from "./App";

try {
  window.rempeyekBoot?.setPhase("bundle-evaluated");
  const container = document.getElementById("root");
  if (!container) {
    throw new Error("Target container #root element is missing from document");
  }
  createRoot(container).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>
  );
  window.rempeyekBoot?.setPhase("react-mounted");
} catch (error) {
  console.error("[main.jsx] Renderer initialization error:", error);
  window.rempeyekBoot?.showRecovery(error, "bundle-evaluation-failed");
}
