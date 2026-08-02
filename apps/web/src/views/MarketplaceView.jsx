import { useState } from "react";
import { Btn, PageHead, Panel, SectionRow } from "@rempeyek/ui";
import { CatalogGrid } from "../components/CatalogGrid";
import { AddAgentModal } from "../components/AddAgentModal";

/** Marketplace: reviewed agents, plugins, skills, and custom registration. */
export function MarketplaceView({ refresh }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("all");

  return (
    <section className="view active">
      <PageHead title="MARKETPLACE">
        Known agents install with one approved click: adapters are reviewed server-side and never typed here.
      </PageHead>

      <SectionRow label="AGENT CATALOG">
        <Btn
          variant={kind === "agent" ? "primary" : "dim"}
          onClick={() => setKind("agent")}
        >
          Agents
        </Btn>
        <Btn
          variant={kind === "plugin" ? "primary" : "dim"}
          onClick={() => setKind("plugin")}
        >
          Plugins
        </Btn>
        <Btn
          variant={kind === "skill" ? "primary" : "dim"}
          onClick={() => setKind("skill")}
        >
          Skills
        </Btn>
        <Btn variant="primary" onClick={() => setAdding(true)}>
          ＋ REGISTER CUSTOM AGENT
        </Btn>
      </SectionRow>

      <Panel>
        <CatalogGrid kind={kind} onAdded={refresh} />
      </Panel>

      <AddAgentModal
        open={adding}
        initialSelection="custom"
        title="＋ REGISTER CUSTOM AGENT"
        onClose={() => setAdding(false)}
        onAdded={refresh}
      />
    </section>
  );
}
