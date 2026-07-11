import { useState } from "react";
import { Btn, PageHead, SectionRow } from "@rempeyek/ui";
import { AgentCard } from "../components/AgentCard";
import { AgentDetail } from "../components/AgentDetail";
import { AddAgentModal } from "../components/AddAgentModal";

export function AgentsView({ agents, gw, openAgent, onOpenAgent, refresh }) {
  const [adding, setAdding] = useState(false);

  return (
    <section className="view active">
      <PageHead title="AGENTS">
        Click an agent for details: active sessions, spawned subagents, gateway log, telemetry.
        Click the photo to change the avatar.
      </PageHead>

      <SectionRow label="REGISTERED NODES">
        <Btn variant="primary" onClick={() => setAdding(true)}>＋ ADD AGENT</Btn>
      </SectionRow>

      <div className="agent-row agent-row-wide">
        {agents.map(a => (
          <AgentCard key={a.id} agent={a} selected={openAgent === a.id} gw={gw} onOpen={onOpenAgent} />
        ))}
      </div>

      {openAgent && (
        <AgentDetail id={openAgent} gw={gw} refresh={refresh} onClose={() => onOpenAgent(null)} />
      )}

      <AddAgentModal open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </section>
  );
}
