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
  const busy = gw.isBusy(agent.id, "summon") || gw.isBusy(agent.id, "run");

  useEffect(() => {
    if (!open) return;
    const close = e => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [open]);

  const handleGatewayRun = e => {
    e.stopPropagation();
    setOpen(false);
    if (acts.includes("run")) {
      gw.runAction(agent.id, "run");
    } else {
      gw.runTerminal(agent.id, "run");
    }
  };

  const menu = [
    <button key="summon" onClick={e => { e.stopPropagation(); setOpen(false); gw.runTerminal(agent.id, "summon"); }}>
      ⧉ Summon · terminal
    </button>,
    <button key="gw-run" onClick={handleGatewayRun}>
      ⚡ Gateway Run · foreground
    </button>,
    acts.includes("start") && <button key="start" onClick={e => { e.stopPropagation(); setOpen(false); gw.runAction(agent.id, "start"); }}>▶ Start gateway (service)</button>,
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

  return (
    <div className="gw-split" ref={ref} onClick={e => e.stopPropagation()}>
      {summonBtn("gw-main")}
      <Btn variant="run" className="gw-caret" title="More options" onClick={e => { e.stopPropagation(); setOpen(o => !o); }}>▾</Btn>
      <div className={`gw-menu ${open ? "open" : ""}`.trim()}>{menu}</div>
    </div>
  );
}

/** compact = agent card (one primary action). full = detail panel (all actions). */
export function GatewayControls({ agent, gw, compact, onOpenLog }) {
  if (!agent.enabled) {
    return <Btn variant="dim" disabled title={agent.note || "disabled"}>setup required</Btn>;
  }
  const acts = agent.actions || [];
  const termAlive = agent.term?.alive;
  const ownedRunning = agent.proc?.mode === "owned" && agent.proc?.status === "running";
  const serviceRunning = agent.proc?.mode === "service" && agent.proc?.status === "running";
  const running = ownedRunning || serviceRunning;
  const agentBusy = gw.isAgentBusy(agent.id);
  const canStop = termAlive
    || ownedRunning
    || (serviceRunning && acts.includes("stop"));

  if (compact) {
    if (termAlive) return <ActionBtn agent={agent} act="stop-term" gw={gw} />;
    if (running) return <ActionBtn agent={agent} act="stop" gw={gw} />;
    if (agent.canSummon || acts.length > 0) return <SummonSplit agent={agent} gw={gw} />;
    return acts[0] ? <ActionBtn agent={agent} act={acts[0]} gw={gw} /> : null;
  }

  const canRun = acts.includes("run") || Boolean(agent.canSummon);

  return (
    <>
      {agent.canSummon && <SummonSplit agent={agent} gw={gw} />}
      <Btn
        variant="stop"
        disabled={agentBusy || !canStop}
        title={!canStop ? "No stoppable owned process, summoned terminal, or native service is running" : ""}
        onClick={() => gw.runAction(agent.id, termAlive ? "stop-term" : "stop")}
      >
        Stop
      </Btn>
      <Btn
        variant="dim"
        disabled={agentBusy || !canRun}
        title={!canRun ? "This profile has no reviewed foreground gateway command" : ""}
        onClick={() => acts.includes("run") ? gw.runAction(agent.id, "run") : gw.runTerminal(agent.id, "run")}
      >
        Gateway run
      </Btn>
      <Btn variant="dim" onClick={onOpenLog}>Log</Btn>
      <Btn
        variant="dim"
        disabled={agentBusy || !acts.includes("status")}
        title={!acts.includes("status") ? "This profile has no reviewed status command" : ""}
        onClick={() => gw.runAction(agent.id, "status")}
      >
        Status
      </Btn>
      {acts.filter(x => !["start", "stop", "run", "status"].includes(x))
        .map(x => <ActionBtn key={x} agent={agent} act={x} gw={gw} />)}
    </>
  );
}
