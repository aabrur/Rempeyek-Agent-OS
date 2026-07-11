import { PageHead } from "@rempeyek/ui";
import { NeuralGraphCanvas } from "../components/NeuralGraphCanvas";
import { Reports } from "../components/Reports";

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

/* ProjectsView was superseded by views/Workspace.jsx (the front door). */
