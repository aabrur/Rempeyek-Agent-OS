import { PageHead } from "@rempeyek/ui";
import { Reports } from "../components/Reports";
import { StatTiles, VaultHealth } from "../components/Panels";

/** Observatory — live telemetry: vault stats, health, and generated reports. */
export function ObservatoryView({ state, accent, ops }) {
  return (
    <section className="view active">
      <PageHead title="OBSERVATORY">
        Live data from the Obsidian Vault · {new Date(state.generatedAt).toLocaleTimeString("en-GB")}
      </PageHead>
      <div className="view-stack">
        <StatTiles stats={state.stats} />
        <VaultHealth health={ops.health} />
        <Reports accent={accent} />
      </div>
    </section>
  );
}
