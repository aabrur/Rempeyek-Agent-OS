import { useEffect, useMemo, useState } from "react";
import { TopoLoad } from "./TopoLoad";
import { agentAccent, nodeStatus } from "../lib/agents";
import { api } from "../api";

const W = 760, H = 460, CX = W / 2, CY = H / 2 - 14, RX = 292, RY = 152;

/** Geometry for one agent node: position, curved dendrite path to the hub. */
function layout(agents) {
  const n = agents.length || 1;
  return agents.map((a, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
    const x = CX + RX * Math.cos(ang), y = CY + RY * Math.sin(ang);
    const dx = x - CX, dy = y - CY, len = Math.hypot(dx, dy) || 1;
    const sx = CX + dx / len * 62, sy = CY + dy / len * 62;
    const tx = x - dx / len * 42, ty = y - dy / len * 42;
    // control point pushed perpendicular so links arc like dendrites, not spokes
    const bend = (i % 2 ? 1 : -1) * Math.min(46, len * 0.16);
    const mx = (sx + tx) / 2 - (ty - sy) / len * bend;
    const my = (sy + ty) / 2 + (tx - sx) / len * bend;
    const d = `M${sx.toFixed(1)},${sy.toFixed(1)} Q${mx.toFixed(1)},${my.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`;
    return { agent: a, i, x, y, sx, sy, tx, ty, d, st: nodeStatus(a), col: agentAccent(a) };
  });
}

export function TopologyMap({ state, accent, load, agentsById, onOpen }) {
  const agents = state.agents;
  const nodes = useMemo(() => layout(agents), [agents]);
  const [topology, setTopology] = useState({ edges: [], metadata: { hasRelationships: false } });
  useEffect(() => {
    let alive = true;
    api("/api/agent-topology").then(data => { if (alive && Array.isArray(data?.edges)) setTopology(data); });
    return () => { alive = false; };
  }, [agents]);
  const positioned = useMemo(() => new Map(nodes.map(node => [node.agent.id, node])), [nodes]);
  const realEdges = topology.edges.map(edge => ({ ...edge, a: positioned.get(edge.source), b: positioned.get(edge.target) })).filter(edge => edge.a && edge.b);

  const n = agents.length;
  const running = agents.filter(a => a.proc?.status === "running").length;
  const errCount = agents.filter(a => a.proc && (a.proc.status === "exited" || a.proc.status === "error")).length;
  const observing = agents.filter(a => !(a.actions || []).length && a.proc?.status !== "running").length;
  const idle = Math.max(0, n - running - errCount - observing);
  const upList = agents.map(a => a.uptime?.pct).filter(v => typeof v === "number");
  const upAvg = upList.length ? Math.round(upList.reduce((s, v) => s + v, 0) / upList.length) : null;
  const locked = state.auth === "token-locked";
  const events = state.events || [];

  return (
    <div className="topology-panel">
      <div className="topo-grid">
        <aside className="topo-side">
          <div className="topo-box">
            <div className="topo-h">NETWORK OVERVIEW</div>
            <div className="topo-stat"><span>TOTAL NODES</span><b>{n}</b></div>
            <div className="topo-stat"><span><i className="dot running" />ACTIVE</span><b>{running}</b></div>
            <div className="topo-stat"><span><i className="dot exited" />OBSERVING</span><b>{observing}</b></div>
            <div className="topo-stat"><span><i className="dot idle" />IDLE</span><b>{idle}</b></div>
            {errCount > 0 && <div className="topo-stat"><span><i className="dot error" />ERROR</span><b>{errCount}</b></div>}
          </div>
          <div className="topo-box">
            <div className="topo-h">NETWORK LOAD</div>
            <TopoLoad load={load} accent={accent} />
          </div>
          <div className="topo-box">
            <div className="topo-h">SECURITY STATUS</div>
            <div className={`topo-big ${locked ? "tb-ok" : ""}`.trim()}>🛡 {locked ? "TOKEN-LOCKED" : "LOCAL-ONLY"}</div>
          </div>
          <div className="topo-box">
            <div className="topo-h">MEAN UPTIME 24H</div>
            <div className="topo-big">{upAvg == null ? "—" : `${upAvg}%`}</div>
          </div>
        </aside>

        <div className="topo-map">
          <svg className="topology" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Agent topology map">
            <defs>
              <filter id="topoGlow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="3.2" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="hubCore">
                <stop offset="0" stopColor="#12324A" /><stop offset="1" stopColor="#14112A" />
              </radialGradient>
              <radialGradient id="hubHalo">
                <stop offset="0" stopColor={accent} stopOpacity=".28" />
                <stop offset=".6" stopColor="#8C5BFF" stopOpacity=".1" />
                <stop offset="1" stopColor="#8C5BFF" stopOpacity="0" />
              </radialGradient>
              {nodes.map(({ agent, sx, sy, tx, ty, col, st }) => {
                const run = st.cls === "top-run";
                return (
                  <g key={agent.id}>
                    <linearGradient id={`lg-${agent.id}`} gradientUnits="userSpaceOnUse" x1={sx.toFixed(1)} y1={sy.toFixed(1)} x2={tx.toFixed(1)} y2={ty.toFixed(1)}>
                      <stop offset="0" stopColor={accent} stopOpacity={run ? .8 : .35} />
                      <stop offset="1" stopColor={col} stopOpacity={run ? .95 : .5} />
                    </linearGradient>
                    <radialGradient id={`ng-${agent.id}`}>
                      <stop offset="0" stopColor={col} stopOpacity={run ? ".5" : ".3"} />
                      <stop offset="1" stopColor={col} stopOpacity="0" />
                    </radialGradient>
                  </g>
                );
              })}
            </defs>

            {realEdges.map((edge, i) => {
              const { a, b } = edge;
              const d = `M${a.x.toFixed(1)},${a.y.toFixed(1)} Q${CX.toFixed(1)},${CY.toFixed(1)} ${b.x.toFixed(1)},${b.y.toFixed(1)}`;
              return (
                <g key={`${edge.type}-${edge.provenance.source}-${edge.provenance.id}`}>
                  <path
                    className={edge.flowing ? "top-link-run" : "top-link"} d={d} fill="none"
                    stroke={agentAccent(a.agent)} strokeWidth={edge.flowing ? 2 : 1.1}
                    opacity={edge.flowing ? .95 : .55} filter="url(#topoGlow)"
                  />
                  {edge.flowing && <circle className="top-flow-dot" r="2.6" fill={agentAccent(b.agent)} opacity=".95" filter="url(#topoGlow)"><animateMotion dur={`${2.2 + i * 0.2}s`} repeatCount="indefinite" path={d} /></circle>}
                </g>
              );
            })}
            {!topology.metadata?.hasRelationships && <text x={CX} y={CY} textAnchor="middle" fill="#8E88BE" fontSize="11">No verified agent relationships yet</text>}

            {nodes.map(({ agent, x, y, col, st }) => {
              const run = st.cls === "top-run";
              return (
                <g
                  key={`node-${agent.id}`}
                  className={`top-node ${st.cls}`}
                  transform={`translate(${x.toFixed(1)},${y.toFixed(1)})`}
                  style={{ cursor: "pointer" }}
                  role="button"
                  tabIndex="0"
                  aria-label={`Open ${agent.name}, status ${st.label}`}
                  onClick={() => onOpen(agent.id)}
                  onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(agent.id); } }}
                >
                  <circle r="52" fill={`url(#ng-${agent.id})`} />
                  {run && <circle className="top-shock" r="26" fill="none" stroke={st.ring} strokeWidth="1.2" />}
                  <circle r="31" fill="none" stroke={col} strokeWidth="1" opacity=".28" />
                  {run && <g className="top-orbit"><circle r="27.5" fill="none" stroke={st.ring} strokeWidth="1.6" strokeDasharray="2 9.5" opacity=".9" /></g>}
                  {run && <circle className="top-pulse" r="24" fill="none" stroke={st.ring} strokeWidth="1.5" opacity=".8" />}
                  <circle r="24" fill="none" stroke={st.ring} strokeWidth="2.4" strokeDasharray={st.cls === "top-obs" ? "4 4" : undefined} filter="url(#topoGlow)" />
                  <circle r="19" fill="#100E1FE6" stroke="#2A2744" strokeWidth="1" />
                  <text y="6" textAnchor="middle" fontSize="16">{agent.icon || "◈"}</text>
                  <text y="46" textAnchor="middle" fontSize="11" fill="#EEEBFF" fontFamily="Bahnschrift,sans-serif" fontWeight="600">{agent.name}</text>
                  <text y="59" textAnchor="middle" fontSize="8.5" fill={st.ring} fontFamily="Cascadia Mono,monospace">{st.label}</text>
                  <text y="-37" textAnchor="middle" fontSize="8" fill="#8E88BE" fontFamily="Cascadia Mono,monospace">{agent.node || ""}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="topo-side">
          <div className="topo-box topo-log-box">
            <div className="topo-h">SYSTEM LOG</div>
            <div className="topo-log">
              {events.length ? events.map((ev, i) => (
                <div key={i} className="topo-ev">
                  <span className="t">{(ev.ts || "").slice(11, 19)}</span>
                  <span className="a" style={{ color: agentAccent(agentsById[ev.id] || ev.id) }}>
                    {agentsById[ev.id]?.name || ev.id}
                  </span>
                  <span className={`m lv-${ev.level || "ok"}`}>{ev.msg}</span>
                </div>
              )) : (
                <div className="topo-ev-empty">No gateway events yet — Summon / Start / Status actions and status changes appear here.</div>
              )}
            </div>
          </div>
          <div className="topo-box">
            <div className="topo-h">VAULT ACTIVITY</div>
            <div className="topo-stat"><span>NOTES</span><b>{state.stats.notes.value}</b></div>
            <div className="topo-stat"><span>CHANGED 7D</span><b>{state.stats.activeWeek.value}</b></div>
            <div className="topo-stat"><span>OPEN TASKS</span><b>{state.stats.openTasks.value}</b></div>
          </div>
        </aside>
      </div>

      <div className="topo-legend">
        <span className="topo-h">AGENT STATUS LEGEND</span>
        <span className="tl"><i style={{ background: "#A6FF3C", boxShadow: "0 0 6px #A6FF3C" }} />RUNNING<em>active &amp; processing</em></span>
        <span className="tl"><i style={{ background: "#8E88BE" }} />IDLE<em>standby</em></span>
        <span className="tl"><i className="tl-dash" />OBSERVE<em>monitoring / summon-only</em></span>
        <span className="tl"><i style={{ background: "#FF4D6A" }} />ERROR<em>exited / down</em></span>
        <span className="tl"><i style={{ background: "#3A3654" }} />OFFLINE<em>disabled</em></span>
      </div>
      <div className="topo-foot">
        🔒 {state.agency || "AGENTIC//OS"} MESH · {locked ? "TOKEN AUTH" : "LOCAL ONLY"} · {n} NODES
      </div>
    </div>
  );
}
