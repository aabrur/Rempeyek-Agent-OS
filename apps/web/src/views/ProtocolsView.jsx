import { PageHead } from "@rempeyek/ui";
import { ReviewPanel } from "../components/ReviewPanel";
import { ScheduleList, WorkflowCards } from "../components/Panels";
import { SwitchboardMessenger } from "../components/SwitchboardMessenger";

/** Switchboard: approvals, messaging, routing, scheduled automation. */
export function ProtocolsView({ state, ops, refresh }) {
  return (
    <section className="view active">
      <PageHead title="SWITCHBOARD">
        Approvals waiting on you, agent-to-agent messages, primary workflow routing, and scheduled automation.
      </PageHead>
      <div className="view-stack">
        <div className="two-col">
          <ReviewPanel review={state.review} agents={state.agents} refresh={refresh} />
          <SwitchboardMessenger agents={state.agents} refresh={refresh} />
        </div>
        <div className="two-col">
          <WorkflowCards workflows={state.workflows} refresh={refresh} />
          <ScheduleList schedule={ops.schedule} />
        </div>
      </div>
    </section>
  );
}
