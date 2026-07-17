import { m } from "framer-motion";
import { Activity, Database, MoreHorizontal, Network } from "lucide-react";
import { Btn } from "@rempeyek/ui";
import { CORE_ID } from "../../lib/cosmos-map.mjs";
import { agentAccent } from "../lib/agents";
import { CORE_ICON, iconFor } from "../lib/agent-icons";

const RELATION_LABEL = {
  dependency: "Dependency",
  co_assignment: "Co-assignment",
  task_assignment: "Task assignment",
  spawned_subagent: "Spawned subagent",
  communication: "Communication",
};
const TIER_BAR = { strong: 90, data: 60, weak: 30 };

function SignalBar({ label, value, suffix = "%", color }) {
  return (
    <div className="cd-bar-row">
      <span className="cd-bar-label">{label}</span>
      <div className="cd-bar">
        {value !== null && (
          <m.i
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
            transition={{ duration: 0.7, ease: "easeOut" }}
            style={{ background: `linear-gradient(to right, color-mix(in srgb, ${color} 40%, transparent), ${color})` }}
          />
        )}
      </div>
      <span className="cd-bar-value" style={{ color }}>{value === null ? "—" : `${value}${suffix}`}</span>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="cd-section">
      <div className="cd-section-head">{Icon && <Icon size={10} aria-hidden="true" />} {title}</div>
      {children}
    </div>
  );
}

function MetaRows({ rows }) {
  return (
    <div className="cd-meta">
      {rows.filter(([, v]) => v !== null && v !== undefined && v !== "").map(([k, v]) => (
        <div key={k} className="cd-meta-row"><span>{k}</span><b title={String(v)}>{v}</b></div>
      ))}
    </div>
  );
}

function Chips({ items }) {
  if (!items.length) return null;
  return <div className="cd-chips">{items.map(tag => <span key={tag} className="cd-chip">{tag}</span>)}</div>;
}

function PanelShell({ children, panelKey }) {
  return (
    <m.div
      key={panelKey}
      className="cd-body"
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 8 }}
      transition={{ duration: 0.22 }}
    >
      {children}
    </m.div>
  );
}

function Header({ icon: Icon, color, statusColorVar, name, subtitle, badges, onClear }) {
  return (
    <div className="cd-head">
      <div className="cd-head-row">
        <div className="cd-icon-tile" style={{ "--cd-c": color }}>
          <Icon size={20} color={color} strokeWidth={1.5} aria-hidden="true" />
          <span className="cd-status-dot" style={{ background: `var(${statusColorVar})` }} aria-hidden="true" />
        </div>
        <div className="cd-title">
          <h3>{name}</h3>
          <span style={{ color }}>{subtitle}</span>
        </div>
        {onClear && (
          <button type="button" className="cd-more" onClick={onClear} title="Clear selection" aria-label="Clear selection">
            <MoreHorizontal size={14} aria-hidden="true" />
          </button>
        )}
      </div>
      <div className="cd-badges">{badges}</div>
    </div>
  );
}

function AgentPanel({ row, node, map, onOpenAgent, onSelect, onClear }) {
  const color = agentAccent(node);
  const Icon = iconFor(node.id);
  const incidents = map.rows.filter(r => r.kind === "relationship" && (r.source === node.id || r.target === node.id));
  const chips = [
    ...(node.mode ? [node.mode.toUpperCase()] : []),
    ...(node.node ? [String(node.node).toUpperCase()] : []),
    ...((node.actions || []).map(a => a.toUpperCase())),
  ].slice(0, 6);
  const description = node.role || node.note
    ? [node.role, node.note].filter(Boolean).join(" — ")
    : "No operator note recorded for this agent yet. Role and notes come straight from agents.config.json.";

  return (
    <PanelShell panelKey={`agent:${node.id}`}>
      <Header
        icon={Icon} color={color} statusColorVar={`--cosmos-status-${node.status}`}
        name={node.name || node.id} subtitle={(node.role || "AGENT").toUpperCase()}
        onClear={onClear}
        badges={<>
          <span className={`cd-badge status-${node.status}`}>● {String(node.status).toUpperCase()}</span>
          {row?.isAnchor && <span className="cd-badge cd-badge-core">ANCHOR</span>}
        </>}
      />
      <div className="cd-desc">{description}</div>
      <Chips items={chips} />

      <Section icon={Network} title="CONNECTIONS">
        {incidents.length ? (
          <div className="cd-conn-list">
            {incidents.slice(0, 7).map(r => {
              const peerId = r.source === node.id ? r.target : r.source;
              const peer = map.nodes.find(n => n.id === peerId);
              const PeerIcon = iconFor(peerId);
              const edge = map.edges.find(e => e.id === r.id.slice(5));
              const tier = edge?.tier || "weak";
              return (
                <button type="button" key={r.id} className="cd-conn" onClick={() => onSelect(r.id)}>
                  <PeerIcon size={11} color={agentAccent(peer || peerId)} aria-hidden="true" />
                  <span className="cd-conn-name">{r.source === node.id ? r.targetLabel : r.sourceLabel}</span>
                  <i className={`cd-conn-dot status-${peer?.status || "idle"}`} aria-hidden="true" />
                  <span className="cd-conn-bar"><i className={`tier-${tier}`} style={{ width: `${TIER_BAR[tier]}%` }} /></span>
                  <small>{RELATION_LABEL[r.type] || r.type}</small>
                </button>
              );
            })}
          </div>
        ) : <p className="cd-empty-line">No verified relationship records for this agent.</p>}
      </Section>

      <Section icon={Activity} title="SIGNALS · MEASURED">
        <SignalBar label="UPTIME 24H" value={node.signals.uptimePct} color="var(--cosmos-conn-strong)" />
        <SignalBar label="VERIFIED LINKS" value={node.signals.linksPct} suffix={`% · ${node.signals.links}`} color="var(--cosmos-conn-data)" />
        <SignalBar label="VAULT RECENCY" value={node.signals.recencyPct} color="var(--cosmos-ok)" />
      </Section>

      <Section icon={Database} title="METADATA">
        <MetaRows rows={[
          ["AGENT ID", node.id],
          ["NODE", node.node],
          ["LANE", node.lane ? `Brains/${node.lane}/` : "not configured"],
          ["MODE", node.mode || "—"],
          ["LAST VAULT WRITE", node.lastSeen || "never observed"],
          ["UPTIME 24H", node.signals.uptimePct === null ? "—" : `${node.signals.uptimePct}%`],
        ]} />
      </Section>

      <div className="cd-actions">
        <Btn variant="primary" onClick={() => onOpenAgent(node.id)}>Open agent detail</Btn>
      </div>
    </PanelShell>
  );
}

function CorePanel({ map, vault, onSelect, onClear }) {
  const { core } = map;
  return (
    <PanelShell panelKey="core">
      <Header
        icon={CORE_ICON} color="var(--cosmos-core)" statusColorVar={core.laneCount ? "--cosmos-status-running" : "--cosmos-status-idle"}
        name={core.name} subtitle={core.subtitle}
        onClear={onClear}
        badges={<>
          <span className={`cd-badge ${core.laneCount ? "status-running" : "status-idle"}`}>● {core.laneCount ? "ACTIVE" : "IDLE"}</span>
          <span className="cd-badge cd-badge-core">CORE</span>
        </>}
      />
      <div className="cd-desc">
        The shared Obsidian vault — long-term memory and coordination surface for every agent.
        Lanes below are drawn only from observed vault activity, never inferred.
      </div>

      <Section icon={Network} title={`VAULT LANES · ${core.laneCount}`}>
        {map.laneLinks.length ? (
          <div className="cd-conn-list">
            {map.laneLinks.map(link => {
              const node = map.nodes.find(n => n.id === link.agentId);
              const PeerIcon = iconFor(link.agentId);
              return (
                <button type="button" key={link.id} className="cd-conn" onClick={() => onSelect(`node:${link.agentId}`)}>
                  <PeerIcon size={11} color={agentAccent(node || link.agentId)} aria-hidden="true" />
                  <span className="cd-conn-name">{node?.name || link.agentId}</span>
                  <small>{link.lastSeen ? `last write ${link.lastSeen}` : `lane Brains/${link.lane}/`}</small>
                </button>
              );
            })}
          </div>
        ) : <p className="cd-empty-line">No agent has a configured lane or an observed vault write yet.</p>}
      </Section>

      <Section icon={Database} title="METADATA">
        <MetaRows rows={[
          ["VAULT", vault || "—"],
          ["AGENTS", map.metadata.nodeCount],
          ["VERIFIED LINKS", map.metadata.edgeCount],
          ["EXCLUDED RECORDS", map.metadata.droppedRelations || 0],
        ]} />
      </Section>
    </PanelShell>
  );
}

function EdgePanel({ row, onClear }) {
  return (
    <PanelShell panelKey={row.id}>
      <Header
        icon={Network} color="var(--cosmos-conn-strong)" statusColorVar="--cosmos-status-running"
        name={RELATION_LABEL[row.type] || row.type} subtitle="RELATIONSHIP EVIDENCE"
        onClear={onClear}
        badges={<span className="cd-badge status-running">● {String(row.status).toUpperCase()}</span>}
      />
      <div className="cd-desc cd-route">
        <b>{row.sourceLabel}</b> <span aria-hidden="true">→</span> <b>{row.targetLabel}</b>
      </div>
      <Section icon={Database} title="PROVENANCE">
        <MetaRows rows={[
          ["TYPE", row.type],
          ["STATUS", row.status],
          ["SOURCE", row.provenanceSource],
          ["RECORD ID", row.provenanceId],
        ]} />
      </Section>
    </PanelShell>
  );
}

/** Right detail panel: agent facts, vault core, or relationship provenance. */
export function CosmosDetail({ selectionId, map, vault, onOpenAgent, onSelect, onClear }) {
  const row = selectionId && selectionId !== CORE_ID ? map.rows.find(r => r.id === selectionId) : null;
  const node = row?.kind === "agent" ? map.nodes.find(n => n.id === row.agentId) : null;

  return (
    <aside className="cosmos-detail" aria-label="Agent Map detail panel" aria-live="polite">
      {selectionId === CORE_ID ? (
        <CorePanel key="core" map={map} vault={vault} onSelect={onSelect} onClear={onClear} />
      ) : node ? (
        <AgentPanel key={node.id} row={row} node={node} map={map} onOpenAgent={onOpenAgent} onSelect={onSelect} onClear={onClear} />
      ) : row?.kind === "relationship" ? (
        <EdgePanel key={row.id} row={row} onClear={onClear} />
      ) : (
        <m.div key="empty" className="cd-empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          <Network size={30} aria-hidden="true" />
          <span>SELECT AN AGENT</span>
        </m.div>
      )}
    </aside>
  );
}
