import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ADD_LANE_WIDTH, HANDLES_PER_SIDE, LANE_LABEL_WIDTH, PHASE_HEADER_HEIGHT } from './layout'

// Points d'ancrage répartis verticalement (25/50/75% par défaut pour 3
// poignées) plutôt qu'un unique point central, pour que plusieurs liens
// entrant/sortant sur la même carte ne partent pas tous du même pixel.
const HANDLE_OFFSETS = Array.from({ length: HANDLES_PER_SIDE }, (_, i) => `${((i + 1) / (HANDLES_PER_SIDE + 1)) * 100}%`)

export function PhaseHeaderNode({ data }: NodeProps) {
  // La largeur vient de computeLayout (data.width) : une phase qui a
  // besoin de plusieurs sous-colonnes (plusieurs activités concurrentes
  // d'un même acteur) a un en-tête plus large, pas une largeur fixe.
  return (
    <div className="lane-node phase-header" style={{ width: (data.width as number) - 8, height: PHASE_HEADER_HEIGHT - 8 }}>
      {data.label as string}
    </div>
  )
}

export function ActorHeaderNode({ data }: NodeProps) {
  return (
    <div
      className="lane-node actor-header"
      style={{ width: LANE_LABEL_WIDTH - 8, height: (data.height as number) - 8, borderLeftColor: data.color as string }}
    >
      {data.label as string}
    </div>
  )
}

// Bouton "+" en tête de la colonne ajoutée après la dernière phase :
// ajoute une phase. Même hauteur que les en-têtes de phase pour
// s'aligner visuellement avec eux. Le clic est géré au niveau de
// ReactFlow (onNodeClick, voir ProcessDiagram.tsx), pas ici : ce
// composant reste un simple rendu, cohérent avec les autres nœuds
// d'en-tête (aucun n'a son propre gestionnaire de clic).
export function AddPhaseNode({ data }: NodeProps) {
  return (
    <div className="lane-node add-lane-button" style={{ width: ADD_LANE_WIDTH - 8, height: (data.height as number) - 8 }}>
      + Phase
    </div>
  )
}

// Bouton "+" du reste de cette même colonne, une cellule par acteur :
// ajoute une activité pour cet acteur (voir data.actorId, posé par
// computeLayout). Positionné après la dernière phase plutôt que dans
// une phase existante — l'utilisateur choisit la phase ensuite via
// glisser-déposer ou l'onglet Édition, comme pour toute activité.
export function AddActivityNode({ data }: NodeProps) {
  return (
    <div className="lane-node add-lane-button" style={{ width: ADD_LANE_WIDTH - 8, height: (data.height as number) - 8 }}>
      + Activité
    </div>
  )
}

export function ActivityNode({ data }: NodeProps) {
  const storyCount = data.storyCount as number
  const specCount = data.specCount as number
  const color = data.color as string
  return (
    <div
      className="activity-card"
      style={{ borderTopColor: color, borderLeftColor: color, ['--card-color' as string]: color }}
    >
      {/* Poignées gauche/droite : interactions entre activités de phases différentes. */}
      {HANDLE_OFFSETS.map((top, i) => (
        <Handle key={`in-h${i}`} id={`in-h${i}`} type="target" position={Position.Left} style={{ top }} />
      ))}
      {HANDLE_OFFSETS.map((top, i) => (
        <Handle key={`out-h${i}`} id={`out-h${i}`} type="source" position={Position.Right} style={{ top }} />
      ))}
      {/* Poignées haut/bas : interactions au sein de la même phase (entre
          acteurs différents), pour ne pas partager le couloir gauche/droite
          utilisé par les interactions inter-phases et éviter que les liens
          s'entremêlent quand beaucoup d'activités se déroulent dans une
          même phase. */}
      {HANDLE_OFFSETS.map((left, i) => (
        <Handle key={`top-in-h${i}`} id={`top-in-h${i}`} type="target" position={Position.Top} style={{ left }} />
      ))}
      {HANDLE_OFFSETS.map((left, i) => (
        <Handle key={`top-out-h${i}`} id={`top-out-h${i}`} type="source" position={Position.Top} style={{ left }} />
      ))}
      {HANDLE_OFFSETS.map((left, i) => (
        <Handle key={`bottom-in-h${i}`} id={`bottom-in-h${i}`} type="target" position={Position.Bottom} style={{ left }} />
      ))}
      {HANDLE_OFFSETS.map((left, i) => (
        <Handle key={`bottom-out-h${i}`} id={`bottom-out-h${i}`} type="source" position={Position.Bottom} style={{ left }} />
      ))}
      <div className="activity-card-title">{data.label as string}</div>
      {(storyCount > 0 || specCount > 0) && (
        <div className="activity-card-meta">
          {storyCount > 0 && <span>{storyCount} {storyCount > 1 ? 'stories' : 'story'}</span>}
          {specCount > 0 && <span>{specCount} spec{specCount > 1 ? 's' : ''}</span>}
        </div>
      )}
    </div>
  )
}

export const nodeTypes = {
  phaseHeader: PhaseHeaderNode,
  actorHeader: ActorHeaderNode,
  activity: ActivityNode,
  addPhase: AddPhaseNode,
  addActivity: AddActivityNode,
}
