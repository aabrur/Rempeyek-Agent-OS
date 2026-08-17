import { useState } from "react";
import { Btn, PageHead, SectionRow } from "@rempeyek/ui";
import { AgentCard } from "../components/AgentCard";
import { AgentDetail } from "../components/AgentDetail";
import { AddAgentModal } from "../components/AddAgentModal";
import { OperationalSyncPrompt } from "../components/OperationalSyncPrompt";

export function AgentsView({ agents, gw, openAgent, onOpenAgent, refresh }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="view active">
      <PageHead title="AGENTS">
        Click an agent for details: active sessions, spawned subagents, gateway log, telemetry.
        Click the photo to change the avatar.
      </PageHead>

      <OperationalSyncPrompt />

      <SectionRow label="REGISTERED NODES">
        {agents.length > 0 && <Btn onClick={gw.startAll}>▶ START ALL GATEWAYS</Btn>}
        <Btn variant="primary" onClick={() => setAdding(true)}>＋ ADD AGENT</Btn>
      </SectionRow>

      {agents.length === 0 ? (
        <div className="agent-empty-state" style={{ padding: "48px 24px", textAlign: "center", border: "1px dashed var(--border, rgba(255,255,255,0.15))", borderRadius: 8, margin: "24px 0", background: "var(--card-bg, rgba(0,0,0,0.2))" }}>
          <div style={{ fontSize: "2rem", marginBottom: 12 }}>🤖</div>
          <h3 style={{ margin: "0 0 8px 0", color: "var(--text, #fff)", fontSize: "1.1rem" }}>No Registered Agents</h3>
          <p style={{ margin: "0 0 20px 0", opacity: 0.75, maxWidth: 520, marginLeft: "auto", marginRight: "auto", lineHeight: 1.5, fontSize: "0.9rem" }}>
            Rempeyek Agent OS starts with zero agents to protect your consent. You decide which agents join your operating system. Click <b>＋ ADD AGENT</b> to register a custom agent or install from the Marketplace.
          </p>
          <Btn variant="primary" onClick={() => setAdding(true)}>＋ REGISTER YOUR FIRST AGENT</Btn>
        </div>
      ) : (
        <div className="agent-row agent-row-wide">
          {agents.map(a => (
            <AgentCard key={a.id} agent={a} selected={openAgent === a.id} gw={gw} onOpen={onOpenAgent} />
          ))}
        </div>
      )}

      {openAgent && (
        <AgentDetail id={openAgent} gw={gw} refresh={refresh} onClose={() => onOpenAgent(null)} />
      )}

      <AddAgentModal open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </section>
  );
}
