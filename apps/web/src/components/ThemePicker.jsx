import { THEMES } from "@rempeyek/theme-engine";

export function ThemePicker({ theme, onPick }) {
  const active = THEMES.find(t => t.id === theme);
  return (
    <>
      <div className="side-label" id="theme-picker-label">APPEARANCE</div>
      <div className="theme-pick" role="radiogroup" aria-labelledby="theme-picker-label">
        {THEMES.map(t => (
          <button type="button" key={t.id}
            className={`theme-sw ${t.id === theme ? "on" : ""}`.trim()}
            style={{ "--sw": t.sw, "--sw-bg": t.bg }}
            title={`${t.name} — ${t.description}`} role="radio"
            aria-label={`${t.name}: ${t.description}`} aria-checked={t.id === theme}
            onClick={() => onPick(t.id)}>
            <span className="theme-sw-label">{t.name}</span>
          </button>
        ))}
      </div>
      <div className="theme-name" aria-live="polite">{active?.name || theme}</div>
    </>
  );
}
