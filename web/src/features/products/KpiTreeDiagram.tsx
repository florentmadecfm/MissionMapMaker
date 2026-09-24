import type { ProductKpi } from '../../api/types'
import { buildKpiForest, type KpiForestNode } from './kpiTree'

interface Props {
  kpis: ProductKpi[]
  onSelectKpi: (kpiId: string) => void
}

// Visualisation en lecture seule de l'arbre de KPI, en complément du
// formulaire d'édition (les cartes juste en dessous, ProductsScreen.tsx)
// — retour utilisateur : l'indentation des cartes suggère la hiérarchie
// mais n'en donne pas une vue d'ensemble claire. Organigramme en CSS pur
// (ul/li imbriqués + connecteurs par pseudo-éléments, voir App.css) plutôt
// qu'une réutilisation de React Flow (déjà présent pour ProcessDiagram.tsx)
// : un arbre de KPI est typiquement peu profond et purement consultatif
// ici, pan/zoom/drag seraient hors de proportion. Cliquer un nœud fait
// défiler jusqu'à sa carte d'édition et la met brièvement en surbrillance
// (voir handleSelectKpi, ProductsScreen.tsx) — relie la vue d'ensemble au
// CRUD plutôt que de rester une simple image décorative.
export function KpiTreeDiagram({ kpis, onSelectKpi }: Props) {
  const forest = buildKpiForest(kpis)

  function renderNode(node: KpiForestNode) {
    return (
      <li key={node.kpi.id}>
        <button type="button" className="kpi-tree-node" onClick={() => onSelectKpi(node.kpi.id)}>
          <span className="kpi-tree-node-name">{node.kpi.name || '(sans nom)'}</span>
          {node.kpi.pillar && <span className="kpi-tree-pillar-badge">{node.kpi.pillar}</span>}
        </button>
        {node.children.length > 0 && <ul>{node.children.map(renderNode)}</ul>}
      </li>
    )
  }

  return (
    <div className="kpi-tree-wrapper">
      <ul className="kpi-tree">{forest.map(renderNode)}</ul>
    </div>
  )
}
