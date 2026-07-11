import { ThemePicker } from "./ThemePicker";
import { useClock } from "../hooks/useDashboard";
import { gwState } from "../lib/agents";
import { obsUri } from "../lib/obsidian";

const NAV = [
  { id: "workspace", icon: "◆", label: "Workspace" },
  { id: "command", icon: "▦", label: "Command Center" },
  { id: "agents", icon: "◉", label: "Agents" },
  { id: "graph", icon: "✳", label: "Neural Vault" },
  { id: "reports", icon: "▤", label: "Reports" },
];

export function Sidebar({ view, onView, agents = [], agency, vault, theme, onTheme, onOpenAgent }) {
  const clock = useClock();
  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">◈</div>
        <div>
          <div className="brand-name">
            {agency || <>REMPEYEK<br />AGENT&nbsp;OS</>}
          </div>
          <div className="brand-sub">agentic operating system</div>
        </div>
      </div>

      <nav id="nav">
        {NAV.map(n => (
          <button
            key={n.id}
            className={`nav-item ${view === n.id ? "active" : ""}`.trim()}
            onClick={() => onView(n.id)}
          >
            <span className="nav-ico">{n.icon}</span> {n.label}
          </button>
        ))}
      </nav>

      <div className="side-label">AGENTS</div>
      <div className="side-agents">
        {agents.map(a => {
          const gw = gwState(a.proc);
          return (
            <div key={a.id} className="side-agent" onClick={() => onOpenAgent(a.id)}>
              {a.avatar
                ? <img className="side-avatar" src={a.avatar} alt="" />
                : <span className={`dot ${gw.cls === "running" ? "running" : "idle"}`} title={`gateway ${gw.label}`} />}
              <span><b>{a.name}</b><br />{a.node}</span>
            </div>
          );
        })}
      </div>

      <ThemePicker theme={theme} onPick={onTheme} />

      <div className="side-foot">
        <span>{clock}</span>
        <a className="side-vault" href={obsUri("INDEX.md")} title="Open Neural Vault in Obsidian">✳ Open Neural Vault</a>
        <span title={vault || ""}>{vault || ""}</span>
      </div>
    </aside>
  );
}
