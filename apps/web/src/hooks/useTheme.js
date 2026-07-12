import { useCallback, useEffect, useState } from "react";
import { activateTheme, readTheme } from "@rempeyek/theme-engine";

/** Theme state + the live accent, so JS-drawn SVG/canvas re-reads --acc on switch. */
export function useTheme(onChange) {
  const [theme, setTheme] = useState(readTheme);
  const [acc, setAcc] = useState("#00E5FF");

  useEffect(() => {
    const activated = activateTheme(theme);
    // read AFTER the attribute lands so the new theme's --acc is what we get
    const id = requestAnimationFrame(() => {
      setAcc(activated.accent);
      onChange?.();
    });
    return () => cancelAnimationFrame(id);
  }, [theme, onChange]);

  const selectTheme = useCallback(id => {
    const activated = activateTheme(id);
    setAcc(activated.accent);
    setTheme(activated.theme);
  }, []);

  return { theme, accent: acc, setTheme: selectTheme };
}
