import { useCallback, useState } from "react";
import { api } from "../api";

/** The approval round-trip (confirm → request → decide), shared by every gated action.
    Standalone so the Add-Agent catalog and the update banner reuse the exact same dance. */
export async function approveAction(type, target, consequence) {
  if (!confirm(`${consequence}\n\nTarget: ${target}\n\nContinue?`)) return null;
  const requested = await api("/api/approvals", {
    method: "POST",
    body: JSON.stringify({ type, target, consequence, actor: "dashboard-user" }),
  });
  if (requested.error) { alert(requested.error); return null; }
  const decided = await api(`/api/approvals/${requested.id}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision: "approved", confirmed: true }),
  });
  if (decided.error) { alert(decided.error); return null; }
  return requested.id;
}

/** Gateway actions shared by cards and the detail panel. */
export function useGateway(agents, refresh) {
  const [busy, setBusy] = useState(null);
  const key = (id, act) => `${id}:${act}`;
  const isBusy = (id, act) => busy === key(id, act);

  const approve = useCallback((type, target, consequence) => approveAction(type, target, consequence), []);

  /** start | stop | stop-term | restart | status | run */
  const runAction = useCallback(async (id, act) => {
    setBusy(key(id, act));
    const approvalId = act === "status" ? null : await approve(
      `process.${act}`,
      id,
      `${act === "stop-term" ? "Close the summoned terminal for" : `${act} the gateway/process for`} ${agents?.[id]?.name || id}.`,
    );
    if (act !== "status" && !approvalId) { setBusy(null); return; }
    const r = await api(`/api/proc/${id}/${act}`, {
      method: "POST",
      timeoutMs: ["start", "restart", "stop-term"].includes(act) ? 90000 : act === "status" ? 40000 : undefined,
      headers: approvalId ? { "x-approval-id": approvalId } : undefined,
    });
    setBusy(null);
    if (r.error) alert(r.error);
    else if (act === "status" && r.output) alert(`${id} · status:\n\n${r.output}`);
    setTimeout(refresh, act === "status" ? 200 : 900);
  }, [agents, approve, refresh]);

  /** summon | start | run — opens an elevated terminal. */
  const runTerminal = useCallback(async (id, mode) => {
    setBusy(key(id, mode));
    const approvalId = await approve("terminal.open", id, `Open an elevated ${mode} terminal for ${agents?.[id]?.name || id}.`);
    if (!approvalId) { setBusy(null); return; }
    const r = await api(`/api/proc/${id}/terminal?mode=${mode}`, {
      method: "POST", timeoutMs: 60000, headers: { "x-approval-id": approvalId },
    });
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
  }, [agents, approve, refresh]);

  const startAll = useCallback(async () => {
    const approvalId = await approve("process.start-all", "enabled-agents", "Start every enabled gateway that supports start.");
    if (!approvalId) return;
    const r = await api("/api/proc/start-all", { method: "POST", headers: { "x-approval-id": approvalId } });
    const errs = Object.entries(r || {}).filter(([, value]) => value?.error).map(([id, value]) => `${id}: ${value.error}`);
    if (errs.length) alert("Some failed:\n" + errs.join("\n"));
    setTimeout(refresh, 800);
  }, [approve, refresh]);

  return { runAction, runTerminal, startAll, isBusy };
}
