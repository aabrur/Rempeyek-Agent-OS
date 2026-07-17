import { NeuralGraphCanvas } from "../components/NeuralGraphCanvas";

/** Memory — the Neural Vault knowledge graph (notes + wikilinks). */
export function NeuralVaultView({ active, theme }) {
  return (
    <section className="view view-flush active">
      <NeuralGraphCanvas active={active} theme={theme} />
    </section>
  );
}

/* ReportsView merged into views/ObservatoryView.jsx; ProjectsView was superseded
   by views/Workspace.jsx (the Teams destination). */
