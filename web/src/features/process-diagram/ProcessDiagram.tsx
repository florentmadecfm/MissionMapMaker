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

function toFlowEdge(e: LayoutEdge): Edge {
  return {
    id: e.id,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle,
    targetHandle: e.targetHandle,
    label: e.label,
    type: 'smoothstep',
    style: { stroke: e.color, strokeWidth: 1.75 },
    markerEnd: { type: MarkerType.ArrowClosed, color: e.color, width: 16, height: 16 },
    labelStyle: { fontSize: 11, fontWeight: 600, fill: e.color },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.92 },
    labelBgPadding: [5, 3],
    labelBgBorderRadius: 4,
  }
}

export function ProcessDiagram({ project }: Props) {
  const { nodes, edges } = useMemo(() => computeLayout(project), [project])

  if (project.actors.length === 0 || project.phases.length === 0) {
    return <p className="placeholder">Ajoutez au moins un acteur et une phase pour voir le diagramme.</p>
  }

  return (
    <div className="process-diagram">
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
