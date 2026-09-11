import { Handle, Position, type NodeProps } from '@xyflow/react'
import { ADD_LANE_WIDTH, HANDLES_PER_SIDE, LANE_LABEL_WIDTH, PHASE_HEADER_HEIGHT, type PainPointRowEntry } from './layout'

// Points d'ancrage répartis verticalement (25/50/75% par défaut pour 3
// poignées) plutôt qu'un unique point central, pour que plusieurs liens
// entrant/sortant sur la même carte ne partent pas tous du même pixel.
const HANDLE_OFFSETS = Array.from({ length: HANDLES_PER_SIDE }, (_, i) => `${((i + 1) / (HANDLES_PER_SIDE + 1)) * 100}%`)

export function PhaseHeaderNode({ data }: NodeProps) {
  // La largeur vient de computeLayout (data.width) : une phase qui a
  // besoin de plusieurs sous-colonnes (plusieurs activités concurrentes
  // d'un même acteur, ou une réservation manuelle via le bouton "+"
  // ci-dessous) a un en-tête plus large, pas une largeur fixe. Le clic
  // sur le bouton est géré au niveau de ReactFlow (onNodeClick, voir
  // ProcessDiagram.tsx), qui distingue le bouton du reste de l'en-tête
  // via son élément cible (event.target).
  return (
    <div className="lane-node phase-header" style={{ width: (data.width as number) - 8, height: PHASE_HEADER_HEIGHT - 8 }}>
      {data.label as string}
      <button type="button" className="add-subcolumn-button" title="Ajouter une colonne pour cette phase">
        +
      </button>
    </div>
  )
}

export function ActorHeaderNode({ data }: NodeProps) {
  // La hauteur vient de computeLayout (data.height) : un acteur qui a
  // besoin de plusieurs sous-lignes (une activité positionnée sur
  // Activity.subRow > 0, ou une réservation manuelle via le bouton "+"
  // ci-dessous) a un en-tête plus haut, symétrique de PhaseHeaderNode.
  return (
    <div
      className="lane-node actor-header"
      style={{ width: LANE_LABEL_WIDTH - 8, height: (data.height as number) - 8, borderLeftColor: data.color as string }}
    >
      {data.label as string}
      <button type="button" className="add-sublane-button" title="Ajouter une ligne pour cet acteur">
        +
      </button>
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
  const painPointCount = data.painPointCount as number
  const color = data.color as string
  return (
    <div
      className="activity-card"
      style={{ borderTopColor: color, borderLeftColor: color, ['--card-color' as string]: color }}
    >
      {/* Signale, sans avoir à ouvrir la carte, qu'au moins un point de
          friction a été noté (voir ActivityDetailModal.tsx, ADR-053). */}
      {painPointCount > 0 && (
        <span
          className="activity-card-warning"
          title={`${painPointCount} point${painPointCount > 1 ? 's' : ''} de friction`}
        >
          ⚠
        </span>
      )}
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

// En-tête de gauche de la ligne de synthèse des points de friction (voir
// PainPointCellNode ci-dessous) — même colonne que les en-têtes d'acteur,
// mais sans acteur associé : couleur d'alerte (voir .activity-card-warning,
// ADR-053) plutôt qu'une couleur d'acteur, pour signaler d'un coup d'œil
// que cette ligne est différente des lignes d'acteur au-dessus (ADR-054).
export function PainPointRowLabelNode({ data }: NodeProps) {
  return (
    <div className="lane-node pain-point-row-label" style={{ height: (data.height as number) - 8 }}>
      ⚠ Points de friction
    </div>
  )
}

// Une cellule par phase (même largeur que PhaseHeaderNode) : liste tous
// les points de friction des activités de cette phase, toutes acteurs
// confondus (voir computeLayout) — chaque entrée reste étiquetée par son
// acteur (pastille de couleur) et son activité d'origine. Cliquer une
// entrée ouvre ActivityDetailModal sur l'activité concernée (géré au
// niveau de ReactFlow, onNodeClick, via l'attribut data-activity-id —
// même patron que les boutons "+" des en-têtes, distingués du reste du
// nœud via event.target).
export function PainPointCellNode({ data }: NodeProps) {
  const entries = data.entries as PainPointRowEntry[]
  return (
    <div className="pain-point-cell" style={{ width: (data.width as number) - 8 }}>
      {entries.length === 0 ? (
        <p className="pain-point-cell-empty">—</p>
      ) : (
        entries.map((entry, i) => (
          <div key={i} className="pain-point-cell-entry" data-activity-id={entry.activityId} title={entry.text}>
            <span className="actor-dot" style={{ background: entry.actorColor }} />
            <span className="pain-point-cell-origin">
              {entry.actorName} · {entry.activityName}
            </span>
            <span className="pain-point-cell-text">{entry.text}</span>
          </div>
        ))
      )}
    </div>
  )
}

export const nodeTypes = {
  phaseHeader: PhaseHeaderNode,
  actorHeader: ActorHeaderNode,
  painPointRowLabel: PainPointRowLabelNode,
  painPointCell: PainPointCellNode,
  activity: ActivityNode,
  addPhase: AddPhaseNode,
  addActivity: AddActivityNode,
}
