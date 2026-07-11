import { useEffect, useRef, useState } from "react";
import { Btn } from "@rempeyek/ui";
import { ACT_LABEL, ACT_VARIANT } from "../lib/agents";

function ActionBtn({ agent, act, gw, className }) {
  const busy = gw.isBusy(agent.id, act);
  return (
    <Btn
      variant={ACT_VARIANT[act] || "dim"}
      className={className}
      disabled={busy}
      onClick={e => { e.stopPropagation(); gw.runAction(agent.id, act); }}
    >
      {busy ? "…" : (ACT_LABEL[act] || act)}
    </Btn>
  );
}

/** Summon = the primary action for EVERY agent: opens an admin terminal running the
    agent's CLI. Gateway agents keep their service actions in the caret menu. */
function SummonSplit({ agent, gw }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const acts = agent.actions || [];
  const busy = gw.isBusy(agent.id, "summon");

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const menu = [
    acts.includes("start") && <button key="start" onClick={e => { e.stopPropagation(); setOpen(false); gw.runAction(agent.id, "start"); }}>▶ Start gateway (service)</button>,
    acts.includes("run") && <button key="run" onClick={e => { e.stopPropagation(); setOpen(false); gw.runTerminal(agent.id, "run"); }}>⚡ Gateway run · terminal (foreground)</button>,
    (acts.includes("status") || acts.includes("restart")) && <div key="sep" className="gw-menu-sep" />,
    acts.includes("status") && <button key="status" onClick={e => { e.stopPropagation(); setOpen(false); gw.runAction(agent.id, "status"); }}>◇ Status</button>,
    acts.includes("restart") && <button key="restart" onClick={e => { e.stopPropagation(); setOpen(false); gw.runAction(agent.id, "restart"); }}>↻ Restart</button>,
  ].filter(Boolean);

  const summonBtn = (cls) => (
    <Btn
      variant="run"
      className={cls}
      disabled={busy}
      title={`Open an admin terminal + summon ${agent.name}`}
      onClick={e => { e.stopPropagation(); gw.runTerminal(agent.id, "summon"); }}
    >
      {busy ? "…" : "⧉ Summon"}
    </Btn>
  );

  if (!menu.length) return summonBtn("");

  return (
    <div className="gw-split" ref={ref}>
      {summonBtn("gw-main")}
      <Btn variant="run" className="gw-caret" title="More options" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>▾</Btn>
      <div className={`gw-menu ${open ? "open" : ""}`.trim()}>{menu}</div>
    </div>
  );
}

/** compact = agent card (one primary action). full = detail panel (all actions). */
export function GatewayControls({ agent, gw, compact }) {
  if (!agent.enabled) {
    return <Btn variant="dim" disabled title={agent.note || "disabled"}>setup required</Btn>;
  }
  const acts = agent.actions || [];
  const termAlive = agent.term?.alive;
  const running = agent.proc?.status === "running";

  if (compact) {
    if (termAlive) return <ActionBtn agent={agent} act="stop-term" gw={gw} />;
    if (running) return <ActionBtn agent={agent} act="stop" gw={gw} />;
    if (agent.canSummon) return <SummonSplit agent={agent} gw={gw} />;
    return acts[0] ? <ActionBtn agent={agent} act={acts[0]} gw={gw} /> : null;
  }

  return (
    <>
      {agent.canSummon && <SummonSplit agent={agent} gw={gw} />}
      {termAlive && <ActionBtn agent={agent} act="stop-term" gw={gw} />}
      {acts.filter(x => x !== "start").map(x => <ActionBtn key={x} agent={agent} act={x} gw={gw} />)}
    </>
  );
}
