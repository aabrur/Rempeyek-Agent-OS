import {
  ChevronRight, Cpu, Database, Eye, Map as MapIcon, Network,
  Settings as SettingsIcon, ShoppingBag, Users,
} from "lucide-react";
import { useClock } from "../hooks/useDashboard";
import { obsUri } from "../lib/obsidian";

const NAV = [
  { id: "map", label: "Agent Map", Icon: MapIcon },
  { id: "agents", label: "Agents", Icon: Cpu },
  { id: "teams", label: "Teams", Icon: Users },
  { id: "memory", label: "Memory", Icon: Database },
  { id: "protocols", label: "Protocols", Icon: Network },
  { id: "marketplace", label: "Marketplace", Icon: ShoppingBag },
  { id: "observatory", label: "Observatory", Icon: Eye },
];
const SETTINGS = { id: "settings", label: "Settings", Icon: SettingsIcon };

function NavButton({ item, view, onView }) {
  const active = view === item.id;
  return (
    <button
      className={`nav-item ${active ? "active" : ""}`.trim()}
      aria-current={active ? "page" : undefined}
      onClick={() => onView(item.id)}
    >
      <item.Icon className="nav-ico" size={14} strokeWidth={active ? 2 : 1.5} aria-hidden="true" />
      <span>{item.label}</span>
      {active && <ChevronRight className="nav-chevron" size={10} aria-hidden="true" />}
    </button>
  );
}

export function Sidebar({ view, onView, agents = [], agency, vault }) {
  const clock = useClock();
  const [brandTop, ...brandRest] = String(agency || "REMPEYEK AGENT OS").split(" ");
  const upList = agents.map(a => a.uptime?.pct).filter(v => typeof v === "number");
  const health = upList.length ? Math.round((upList.reduce((s, v) => s + v, 0) / upList.length) * 10) / 10 : null;
  const issues = agents.filter(a => a.proc?.status === "error" || a.proc?.status === "exited").length;

  return (
    <aside className="sidebar" aria-label="Application sidebar">
      <div className="brand">
        <img className="brand-logo" src="/brand/logo.webp" alt="" width="38" height="38" />
        <div>
          <div className="brand-name">{brandTop}</div>
          <div className="brand-sub">{brandRest.join(" ") || "AGENT OS"}</div>
        </div>
      </div>

      <nav id="nav" aria-label="Primary">
        {NAV.map(item => <NavButton key={item.id} item={item} view={view} onView={onView} />)}
      </nav>

      <div className="side-settings">
        <NavButton item={SETTINGS} view={view} onView={onView} />
      </div>

      <div className="side-foot">
        <div className="side-health">
          <span className="side-health-label">SYSTEM HEALTH</span>
          <div className="side-health-row">
            <div className="side-health-bar"><i style={{ width: `${health ?? 0}%` }} /></div>
            <b>{health === null ? "—" : `${health}%`}</b>
          </div>
          <span className={`side-health-note ${issues ? "is-warn" : ""}`.trim()}>
            ● {health === null ? "NO UPTIME DATA YET" : issues ? `${issues} GATEWAY ISSUE${issues > 1 ? "S" : ""}` : "ALL SYSTEMS NOMINAL"}
          </span>
        </div>
        <span>{clock}</span>
        <a className="side-vault" href={obsUri("INDEX.md")} title="Open Neural Vault in Obsidian">✳ Open Neural Vault</a>
        <span title={vault || ""}>{vault || ""}</span>
      </div>
    </aside>
  );
}
