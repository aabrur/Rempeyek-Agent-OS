import { PageHead } from "@rempeyek/ui";
import { NeuralGraphCanvas } from "../components/NeuralGraphCanvas";
import { Reports } from "../components/Reports";
import { obsUri } from "../lib/obsidian";

export function NeuralVaultView({ active, theme }) {
  return (
    <section className="view view-flush active">
      <NeuralGraphCanvas active={active} theme={theme} />
    </section>
  );
}

export function ReportsView({ accent }) {
  return (
    <section className="view active">
      <PageHead title="REPORTS">
        Automatic reports from the vault + gateway status, with visualizations.
        Can be saved as a markdown note to <code>Reports/</code> in the vault.
      </PageHead>
      <Reports accent={accent} />
    </section>
  );
}

export function ProjectsView({ projects }) {
  return (
    <section className="view active">
      <PageHead title="PROJECTS">All project notes in <code>Projects/</code></PageHead>
      <div className="list-panel">
        {projects.map(p => (
          <div key={p.rel} className="list-item">
            <div><b>{p.name}</b><div className="p">{p.rel}</div></div>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <span className="d">{p.updated}</span>
              <a className="chip" style={{ textDecoration: "none" }} href={obsUri(p.rel)}>open</a>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
