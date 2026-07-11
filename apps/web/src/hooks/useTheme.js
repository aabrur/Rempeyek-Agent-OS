import { useCallback, useEffect, useState } from "react";
import { applyTheme, readTheme, accent } from "@rempeyek/theme-engine";

/** Theme state + the live accent, so JS-drawn SVG/canvas re-reads --acc on switch. */
export function useTheme(onChange) {
  const [theme, setTheme] = useState(readTheme);
  const [acc, setAcc] = useState("#00E5FF");

  useEffect(() => {
    applyTheme(theme);
    // read AFTER the attribute lands so the new theme's --acc is what we get
    const id = requestAnimationFrame(() => {
      setAcc(accent());
      onChange?.();
    });
    return () => cancelAnimationFrame(id);
  }, [theme, onChange]);

  return { theme, accent: acc, setTheme: useCallback(id => setTheme(id), []) };
}
