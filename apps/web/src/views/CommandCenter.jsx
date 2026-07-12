import { Btn, PageHead, SectionRow } from "@rempeyek/ui";
import { TopologyMap } from "../components/TopologyMap";
import { AgentCard } from "../components/AgentCard";
import { ReviewPanel } from "../components/ReviewPanel";
import { ScheduleList, StatTiles, VaultHealth, WorkflowCards } from "../components/Panels";

export function CommandCenter({ state, accent, load, agentsById, gw, ops, openAgent, onOpenAgent, refresh }) {
  return (
    <section className="view active">
      <PageHead title="COMMAND CENTER">
        Live data from the Obsidian Vault · {new Date(state.generatedAt).toLocaleTimeString("en-GB")}
      </PageHead>

      <StatTiles stats={state.stats} />

      <SectionRow label="AGENT MAP">
        <Btn variant="primary" onClick={gw.startAll}>▶ START ALL GATEWAYS</Btn>
      </SectionRow>

      <TopologyMap state={state} accent={accent} load={load} agentsById={agentsById} onOpen={onOpenAgent} />

      <div className="agent-row">
        {state.agents.map(a => (
          <AgentCard key={a.id} agent={a} selected={openAgent === a.id} gw={gw} onOpen={onOpenAgent} />
        ))}
      </div>

      <div className="two-col">
        <ReviewPanel review={state.review} agents={state.agents} refresh={refresh} />
        <WorkflowCards />
      </div>

      <div className="two-col">
        <VaultHealth health={ops.health} />
        <ScheduleList schedule={ops.schedule} />
      </div>
    </section>
  );
}
