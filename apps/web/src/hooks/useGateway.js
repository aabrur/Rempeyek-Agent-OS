import { useCallback, useState } from "react";
import { api } from "../api";

/** Gateway actions shared by cards and the detail panel.
    `busy` is the id+action currently in flight, so buttons can show "…". */
export function useGateway(agents, refresh) {
  const [busy, setBusy] = useState(null);
  const key = (id, act) => `${id}:${act}`;
  const isBusy = (id, act) => busy === key(id, act);

  /** start | stop | stop-term | restart | status | run */
  const runAction = useCallback(async (id, act) => {
    const agent = agents?.[id];
    // one confirm before destructive actions on 24/7 native services
    // (stop-term only closes the summoned terminal, never the service → no confirm)
    if (["stop", "restart", "run"].includes(act) && agent?.owner === "native-service"
      && !confirm(`${agent.name} is a 24/7 service. Really '${act}'? This can disrupt the running instance.`)) return;

    setBusy(key(id, act));
    // stop-term = kill-file handshake + verify (+ elevated fallback) → needs longer
    const r = await api(`/api/proc/${id}/${act}`, { method: "POST", timeoutMs: act === "stop-term" ? 90000 : undefined });
    setBusy(null);
    if (r.error) alert(r.error);
    else if (act === "status" && r.output) alert(`${id} · status:\n\n${r.output}`);
    setTimeout(refresh, act === "status" ? 200 : 900);
  }, [agents, refresh]);

  /** summon | start | run — opens a (usually elevated) terminal */
  const runTerminal = useCallback(async (id, mode) => {
    setBusy(key(id, mode));
    // summon waits for the UAC answer server-side (up to 45s) — give it room
    const r = await api(`/api/proc/${id}/terminal?mode=${mode}`, { method: "POST", timeoutMs: 60000 });
    setBusy(null);
    if (r.notInstalled) {
      const i = r.install || {};
      let msg = r.error;
      if (i.cmd) msg += `\n\nInstall with:\n  ${i.cmd}`;
      if (i.note) msg += `\n\n${i.note}`;
      if (i.url) { if (confirm(`${msg}\n\nOpen the install page?`)) window.open(i.url, "_blank", "noopener"); }
      else alert(msg);
    } else if (r.error) alert(r.error);
    else setTimeout(refresh, 5000);
  }, [refresh]);

  const startAll = useCallback(async () => {
    const r = await api("/api/proc/start-all", { method: "POST" });
    const errs = Object.entries(r || {}).filter(([, v]) => v?.error).map(([k, v]) => `${k}: ${v.error}`);
    if (errs.length) alert("Some failed:\n" + errs.join("\n"));
    setTimeout(refresh, 800);
  }, [refresh]);

  return { runAction, runTerminal, startAll, isBusy };
}
