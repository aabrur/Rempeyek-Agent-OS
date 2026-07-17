import { useEffect, useState } from "react";

/* Whether the active theme wants luminous effects. Reads the SAME token the flat themes zero out
   (--graph-effect-glow: 0 in minimalist/brutalist), so glow + particles + stars stay off there with
   no per-theme branching. Re-reads on the theme toggle (data-theme attribute). */
export function useEffectsEnabled() {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const read = () => {
      const value = getComputedStyle(document.documentElement).getPropertyValue("--graph-effect-glow").trim();
      setOn(value !== "0");
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);
  return on;
}
