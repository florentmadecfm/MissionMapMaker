import { useMemo } from 'react'
import { ReactFlow, Background, Controls, MarkerType, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Project } from '../../api/types'
import { computeLayout, type LayoutEdge } from './layout'
import { nodeTypes } from './nodes'
import './process-diagram.css'

interface Props {
  project: Project
}

// Id DOM-safe pour un marqueur de départ partagé par toutes les flèches
// issues d'un acteur de cette couleur (évite de dupliquer un <marker> par
// flèche alors que la couleur, elle, ne varie que par acteur).
function dotMarkerId(color: string) {
  return `mmm-dot-${color.replace('#', '')}`
}

function gradientId(edgeId: string) {
  return `mmm-grad-${edgeId}`
}

function toFlowEdge(e: LayoutEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    type: 'smoothstep',
    // Le trait passe de la couleur de l'acteur de départ à celle de
    // l'acteur d'arrivée (voir <defs> ci-dessous) : on peut suivre une
    // flèche à l'œil même quand elle traverse plusieurs acteurs.
    style: { stroke: `url(#${gradientId(e.id)})`, strokeWidth: 2 },
    // Point de départ : petit disque plein dans la couleur de l'acteur
    // source. Pointe d'arrivée : flèche pleine dans la couleur de
    // l'acteur cible, plus large que le trait pour bien marquer la fin.
    markerStart: dotMarkerId(e.sourceColor),
    markerEnd: { type: MarkerType.ArrowClosed, color: e.targetColor, width: 18, height: 18 },
    labelStyle: { fontSize: 11, fontWeight: 600, fill: 'var(--color-text)' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 4,
  }
}

export function ProcessDiagram({ project }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(project), [project])

  const startColors = useMemo(() => [...new Set(edges.map((e) => e.sourceColor))], [edges])

  if (project.actors.length === 0 || project.phases.length === 0) {
    return <p className="placeholder">Ajoutez au moins un acteur et une phase pour voir le diagramme.</p>
  }

  return (
    <div className="process-diagram">
      {/* Défini une fois, référencé par les styles/markers des flèches
          ci-dessus : dégradé par flèche (couleur départ -> arrivée) et un
          marqueur "point de départ" mutualisé par couleur d'acteur. */}
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
            <marker
              key={color}
              id={dotMarkerId(color)}
              markerWidth={8}
              markerHeight={8}
              refX={4}
              refY={4}
              viewBox="0 0 8 8"
            >
              <circle cx={4} cy={4} r={3.2} fill={color} />
            </marker>
          ))}
        </defs>
      </svg>
      <ReactFlow
        nodes={nodes as unknown as Node[]}
        edges={edges.map(toFlowEdge)}
        nodeTypes={nodeTypes}
        fitView
        nodesConnectable={false}
        elementsSelectable
        panOnScroll
        zoomOnScroll
      >
        <Background gap={24} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
