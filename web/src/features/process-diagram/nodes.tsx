import { Handle, Position, type NodeProps } from '@xyflow/react'
import { COLUMN_WIDTH, LANE_LABEL_WIDTH, PHASE_HEADER_HEIGHT, ROW_HEIGHT } from './layout'

export function PhaseHeaderNode({ data }: NodeProps) {
  return (
    <div className="lane-node phase-header" style={{ width: COLUMN_WIDTH - 8, height: PHASE_HEADER_HEIGHT - 8 }}>
      {data.label as string}
    </div>
  )
}

export function ActorHeaderNode({ data }: NodeProps) {
  return (
    <div
      className="lane-node actor-header"
      style={{ width: LANE_LABEL_WIDTH - 8, height: ROW_HEIGHT - 8, borderLeftColor: data.color as string }}
    >
      {data.label as string}
    </div>
  )
}

export function ActivityNode({ data }: NodeProps) {
  const storyCount = data.storyCount as number
  const specCount = data.specCount as number
  return (
    <div className="activity-card" style={{ borderTopColor: data.color as string }}>
      <Handle type="target" position={Position.Left} />
      <div className="activity-card-title">{data.label as string}</div>
      {(storyCount > 0 || specCount > 0) && (
        <div className="activity-card-meta">
          {storyCount > 0 && <span>{storyCount} {storyCount > 1 ? 'stories' : 'story'}</span>}
          {specCount > 0 && <span>{specCount} spec{specCount > 1 ? 's' : ''}</span>}
        </div>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

export const nodeTypes = {
  phaseHeader: PhaseHeaderNode,
  actorHeader: ActorHeaderNode,
  activity: ActivityNode,
}
