import { useState } from "react";
import { Btn, Overlay } from "@rempeyek/ui";
import { setToken } from "../api";

/** Shown when /api returns 401 (remote access without a valid DASH_TOKEN). */
export function TokenLogin({ open, onSignedIn }) {
  const [value, setValue] = useState("");

  const go = () => {
    const v = value.trim();
    if (!v) return;
    setToken(v);
    onSignedIn();
  };

  return (
    <Overlay open={open}>
      <div className="token-title">◈ AGENTIC//OS locked</div>
      <div className="token-sub">The dashboard requires a token (DASH_TOKEN) for remote access.</div>
      <input
        type="password" placeholder="Enter token…" autoComplete="current-password" autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") go(); }}
      />
      <Btn variant="primary" onClick={go}>Sign in</Btn>
      <div className="token-hint" />
    </Overlay>
  );
}
