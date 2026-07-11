import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@rempeyek/design-system/index.css";
import "@rempeyek/theme-engine/themes.css";
import App from "./App";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
