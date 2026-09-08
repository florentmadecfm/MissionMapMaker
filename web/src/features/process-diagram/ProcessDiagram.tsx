import { useMemo } from 'react'
import { ReactFlow, Background, Controls, type Edge, type Node } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import type { Project } from '../../api/types'
import { computeLayout } from './layout'
import { nodeTypes } from './nodes'
import './process-diagram.css'

interface Props {
  project: Project
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
        edges={edges.map((e) => ({ ...e, type: 'smoothstep', animated: false })) as unknown as Edge[]}
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
