import { useState } from "react";
import { Btn, PageHead, Panel, SectionRow } from "@rempeyek/ui";
import { CatalogGrid } from "../components/CatalogGrid";
import { AddAgentModal } from "../components/AddAgentModal";

/** Marketplace — the vetted agent catalog plus custom registration. */
export function MarketplaceView({ refresh }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="view active">
      <PageHead title="MARKETPLACE">
        Known agents install with one approved click — install commands are vetted server-side, never typed here.
      </PageHead>

      <SectionRow label="AGENT CATALOG">
        <Btn variant="primary" onClick={() => setAdding(true)}>＋ REGISTER CUSTOM AGENT</Btn>
      </SectionRow>

      <Panel>
        <CatalogGrid onAdded={refresh} />
      </Panel>

      <AddAgentModal open={adding} onClose={() => setAdding(false)} onAdded={refresh} />
    </section>
  );
}
