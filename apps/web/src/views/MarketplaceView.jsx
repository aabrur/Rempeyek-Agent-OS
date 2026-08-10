import { useState } from "react";
import { Btn, PageHead, Panel, SectionRow } from "@rempeyek/ui";
import { CatalogGrid } from "../components/CatalogGrid";
import { AddAgentModal } from "../components/AddAgentModal";

/** Marketplace: reviewed agents, plugins, skills, and custom registration.
    Public builds never auto-register agents — users add what they install. */
export function MarketplaceView({ refresh }) {
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState("all");

  return (
    <section className="view active">
      <PageHead title="MARKETPLACE">
        Curated agents, plugins, and skills. Installers are reviewed server-side.
        Registration is always user-driven — nothing is pre-added for you.
      </PageHead>

      <SectionRow label="CATALOG FILTERS">
        <Btn
          variant={kind === "all" ? "primary" : "dim"}
          onClick={() => setKind("all")}
        >
          All
        </Btn>
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

      <Panel title={kind === "plugin" ? "PLUGINS" : kind === "skill" ? "SKILLS" : kind === "agent" ? "AGENTS" : "FULL CATALOG"}>
        <div style={{ opacity: 0.75, fontSize: "0.85rem", marginBottom: 12 }}>
          {kind === "plugin"
            ? "Hypertaks installs with three modes: direct sync to a registered agent, repo download, or copyable config snippet. Skills ride along in the installer bundle."
            : kind === "skill"
              ? "Skills download through the managed installer and can sync into each agent skill folder the user owns."
              : "Newest curated agents stay featured at the top. Install + register only what you choose."}
        </div>
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
