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
    <div className="theme-picker-container">
      <div className="side-label">APPEARANCE MODE</div>
      <div className="theme-grid" role="radiogroup" aria-label="Appearance theme">
        {THEMES.map((t, index) => {
          const isSelected = t.id === theme;
          return (
            <button
              type="button"
              key={t.id}
              ref={node => { buttons.current[index] = node; }}
              className={`theme-card-option ${t.id} ${isSelected ? "active" : ""}`.trim()}
              role="radio"
              aria-label={`${t.name}: ${t.description}`}
              aria-checked={isSelected}
              tabIndex={isSelected ? 0 : -1}
              onKeyDown={navigate}
              onClick={() => onPick(t.id)}
            >
              <div className="theme-card-header">
                <div className="theme-card-title">
                  <span className="theme-dot-swatch" style={{ color: t.sw, background: t.sw }} />
                  <span className="theme-card-name">{t.name}</span>
                </div>
                {isSelected ? <span className="theme-active-chip">ACTIVE</span> : null}
              </div>
              <div className="theme-preview-box" data-theme-preview={t.id}>
                <div className="preview-bar" />
                <div className="preview-content">
                  <div className="preview-pill" />
                </div>
              </div>
              <div className="theme-card-desc">{t.description}</div>
            </button>
          );
        })}
      </div>
      <div className="theme-name" aria-live="polite">{active?.name || theme}</div>
    </div>
  );
}

