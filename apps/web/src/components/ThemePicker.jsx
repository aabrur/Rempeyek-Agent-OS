import { useRef } from "react";
import { THEMES, themeSelectionFromKey } from "@rempeyek/theme-engine";

export function ThemePicker({ theme, onPick }) {
  const active = THEMES.find(t => t.id === theme);
  const buttons = useRef([]);
  const navigate = event => {
    const next = themeSelectionFromKey(theme, event.key);
    if (!next) return;
    event.preventDefault();
    onPick(next);
    buttons.current[THEMES.findIndex(item => item.id === next)]?.focus();
  };

  return (
    <>
      <div className="side-label" id="theme-picker-label">APPEARANCE</div>
      <div className="theme-pick" role="radiogroup" aria-label="Appearance theme">
        {THEMES.map((t, index) => (
          <button type="button" key={t.id}
            ref={node => { buttons.current[index] = node; }}
            className={`theme-sw ${t.id === theme ? "on" : ""}`.trim()}
            style={{ "--sw": t.sw, "--sw-bg": t.bg }}
            title={`${t.name} — ${t.description}`} role="radio"
            aria-label={`${t.name}: ${t.description}`} aria-checked={t.id === theme}
            tabIndex={t.id === theme ? 0 : -1}
            onKeyDown={navigate}
            onClick={() => onPick(t.id)}>
            <span className="theme-sw-label">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="theme-name" aria-live="polite">{active?.name || theme}</div>
    </>
  );
}
