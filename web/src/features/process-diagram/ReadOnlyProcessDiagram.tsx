import { useMemo } from 'react'
import { ReactFlow, Background, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Project } from '../../api/types'
import { computeLayout } from './layout'
import { nodeTypes } from './nodes'
import { dotMarkerId, gradientId, toFlowEdge } from './ProcessDiagram'
import './process-diagram.css'

interface Props {
  project: Project
}

// Rendu en LECTURE SEULE du diagramme de processus — réutilise le même
// calcul de disposition (computeLayout) et les mêmes cartes/flèches
// (nodeTypes, toFlowEdge) que ProcessDiagram.tsx, mais sans aucune des
// interactions qui n'ont pas de sens hors d'un projet ouvert pour édition
// (glisser-déposer, création d'interaction, modales de détail, boutons
// "+"). Utilisé par VariantComparisonScreen.tsx (ADR-063) pour afficher
// côte à côte le diagramme de plusieurs variantes d'une même mission.
//
// Les nœuds "+ Phase"/"+ Activité" (colonne ajoutée après la dernière
// phase par computeLayout) sont filtrés plutôt que simplement désactivés :
// ce sont des actions d'édition, sans équivalent en lecture seule, les
// laisser visibles mais inertes serait trompeur. Les petits boutons "+"
// en coin des en-têtes de phase/acteur restent dans le DOM (portés par
// PhaseHeaderNode/ActorHeaderNode) mais sont masqués en CSS (voir
// .diagram-readonly, process-diagram.css).
export function ReadOnlyProcessDiagram({ project }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(project), [project])
  const displayNodes = useMemo(() => nodes.filter((n) => n.type !== 'addPhase' && n.type !== 'addActivity'), [nodes])
  const startColors = useMemo(() => [...new Set(edges.map((e) => e.sourceColor))], [edges])

  if (project.actors.length === 0 || project.phases.length === 0) {
    return <p className="placeholder">Aucun diagramme pour cette variante.</p>
  }

  return (
    <div className="process-diagram diagram-readonly">
      <svg width={0} height={0} style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          {edges.map((e) => (
            <linearGradient
              key={e.id}
              id={gradientId(e.id)}
              gradientUnits="userSpaceOnUse"
              x1={e.gradient.x1}
              y1={e.gradient.y1}
              x2={e.gradient.x2}
              y2={e.gradient.y2}
            >
              <stop offset="0%" stopColor={e.sourceColor} />
              <stop offset="100%" stopColor={e.targetColor} />
            </linearGradient>
          ))}
          {startColors.map((color) => (
            <marker key={color} id={dotMarkerId(color)} markerWidth={8} markerHeight={8} refX={4} refY={4} viewBox="0 0 8 8">
              <circle cx={4} cy={4} r={3.2} fill={color} />
            </marker>
          ))}
        </defs>
      </svg>
      <ReactFlow
        nodes={displayNodes as unknown as Node[]}
        edges={edges.map(toFlowEdge)}
        nodeTypes={nodeTypes}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnScroll
        // Voir le même réglage sur ProcessDiagram.tsx (ADR-072) : le zoom
        // minimal par défaut (0.5) empêchait fitView() de dézoomer assez
        // pour un diagramme à beaucoup de phases/acteurs, tronquant la
        // colonne d'acteurs hors du cadre visible.
        minZoom={0.1}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} />
      </ReactFlow>
    </div>
  )
}
