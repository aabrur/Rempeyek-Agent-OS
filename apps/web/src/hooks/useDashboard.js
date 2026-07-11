import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";
import { setVaultAbs } from "../lib/obsidian";

const visible = () => document.visibilityState === "visible";

/** The main /api/state poll (6s, paused while the tab is hidden).
    Also keeps the NETWORK LOAD rolling buffer — it advances every poll,
    even when the state itself didn't change. */
export function useDashboard() {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const loadRef = useRef([]);   // rolling running/total ratio, max 40 samples

  const refresh = useCallback(async () => {
    const s = await api("/api/state");
    if (!s || s.error) { setError(s?.error || "server not responding"); return; }
    setError(null);
    if (s.vault) setVaultAbs(s.vault);
    if (Array.isArray(s.agents)) {
      const running = s.agents.filter(a => a.proc?.status === "running").length;
      const buf = loadRef.current;
      buf.push(s.agents.length ? running / s.agents.length : 0);
      if (buf.length > 40) buf.splice(0, buf.length - 40);
    }
    setState(s);
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(() => { if (visible()) refresh(); }, 6000);
    const onVis = () => { if (visible()) refresh(); };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  return { state, error, refresh, load: loadRef };
}

/** Vault health + Windows schedule. Expensive (git/schtasks) → polled slowly. */
export function useOps(active) {
  const [health, setHealth] = useState(null);
  const [schedule, setSchedule] = useState(null);

  const load = useCallback(async () => {
    const [h, s] = await Promise.all([api("/api/vault-health"), api("/api/schedule")]);
    setHealth(h && !h.error ? h : { error: true });
    setSchedule(Array.isArray(s) ? s : []);
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => { if (visible() && active) load(); }, 60000);
    return () => clearInterval(id);
  }, [load, active]);

  return { health, schedule };
}

/** Live clock for the sidebar footer. */
export function useClock() {
  const [now, setNow] = useState(() => new Date().toLocaleString("en-GB"));
  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toLocaleString("en-GB")), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}
