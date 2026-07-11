import { THEMES } from "@rempeyek/theme-engine";

/** Swatch grid — 13 themes. The active one is named underneath. */
export function ThemePicker({ theme, onPick }) {
  const active = THEMES.find(t => t.id === theme);
  return (
    <>
      <div className="side-label">THEME</div>
      <div className="theme-pick">
        {THEMES.map(t => (
          <button
            key={t.id}
            className={`theme-sw ${t.id === theme ? "on" : ""}`.trim()}
            style={{ "--sw": t.sw, "--sw-bg": t.bg }}
            title={t.name}
            aria-label={`Theme: ${t.name}`}
            aria-pressed={t.id === theme}
            onClick={() => onPick(t.id)}
          />
        ))}
      </div>
      <div className="theme-name">{active?.name || theme}</div>
    </>
  );
}
