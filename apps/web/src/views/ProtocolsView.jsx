import { PageHead } from "@rempeyek/ui";
import { ReviewPanel } from "../components/ReviewPanel";
import { ScheduleList, WorkflowCards } from "../components/Panels";

/** Protocols — the rules the agents run by: approvals, routing, scheduled automation. */
export function ProtocolsView({ state, ops, refresh }) {
  return (
    <section className="view active">
      <PageHead title="PROTOCOLS">
        Approvals waiting on you, primary workflow routing, and scheduled automation.
      </PageHead>
      <div className="view-stack">
        <div className="two-col">
          <ReviewPanel review={state.review} agents={state.agents} refresh={refresh} />
          <WorkflowCards />
        </div>
        <ScheduleList schedule={ops.schedule} />
      </div>
    </section>
  );
}
