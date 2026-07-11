import { Avatar, Pill } from "@rempeyek/ui";
import { GatewayControls } from "./GatewayControls";
import { agentAccent, gwState, uptimeClass } from "../lib/agents";

export function AgentCard({ agent, selected, gw, onOpen }) {
  const st = gwState(agent.proc);
  const u = agent.uptime;
  return (
    <div
      className={`agent-card ${selected ? "selected" : ""}`.trim()}
      style={{ "--ac": agentAccent(agent) }}
      onClick={() => onOpen(agent.id)}
    >
      <div className="card-top">
        <Avatar agent={agent} accent={agentAccent(agent)} />
        <div className="card-btns"><GatewayControls agent={agent} gw={gw} compact /></div>
      </div>
      <div className="agent-name">{agent.name}</div>
      <div className="agent-role">{agent.role}</div>
      <div className="pill-row">
        <Pill status={agent.vaultStatus} />
        <Pill status={st.cls} label={st.label} title={st.tip} />
        {u?.samples ? <Pill status={uptimeClass(u)} label={`${u.pct}% up 24h`} title={`24h uptime · ${u.samples} poll samples`} /> : null}
      </div>
    </div>
  );
}
