import { Handle, Position, type NodeProps } from '@xyflow/react'
import { GitBranch, TriangleAlert } from 'lucide-react'
import type { DiffStatus } from '../project-shell/missionDiff'
import {
  ADD_LANE_WIDTH,
  HANDLES_PER_SIDE,
  LANE_LABEL_WIDTH,
  PHASE_HEADER_HEIGHT,
  SATISFACTION_CURVE_HEIGHT,
  type PainPointRowEntry,
  type PhaseMetricEntry,
} from './layout'

// Libellé court affiché sur le badge de comparaison (voir
// VariantComparisonScreen.tsx) — data.diffStatus, posé par
// ProcessDiagram.tsx uniquement quand une comparaison Actuel/Cible est en
// cours, absent (donc aucun badge) partout ailleurs.
const DIFF_LABELS: Record<DiffStatus, string> = {
  added: 'Ajouté',
  removed: 'Supprimé',
  modified: 'Modifié',
}

// Points d'ancrage répartis verticalement (25/50/75% par défaut pour 3
// poignées) plutôt qu'un unique point central, pour que plusieurs liens
// entrant/sortant sur la même carte ne partent pas tous du même pixel.
const HANDLE_OFFSETS = Array.from({ length: HANDLES_PER_SIDE }, (_, i) => `${((i + 1) / (HANDLES_PER_SIDE + 1)) * 100}%`)

// Quadrillage de repère (ADR-077, voir computeLayout/layout.ts pour le
// calcul des positions et le choix de l'empiler en premier dans `nodes`,
// donc toujours derrière le reste) : une ligne verticale par frontière de
// phase, une ligne horizontale par frontière d'acteur, sur toute la
// hauteur/largeur du diagramme. Non interactif (pointer-events: none,
// voir .lane-grid, process-diagram.css) — un simple repère visuel, jamais
// cliquable/glissable comme VisibilityLineNode ci-dessous.
export function LaneGridNode({ data }: NodeProps) {
  const width = data.width as number
  const height = data.height as number
  const phaseLines = data.phaseLines as number[]
  const actorLines = data.actorLines as number[]
  return (
    <div className="lane-grid" style={{ width, height }}>
      {phaseLines.map((x, i) => (
        <div key={`v-${i}`} className="lane-grid-line lane-grid-line-vertical" style={{ left: x }} />
      ))}
      {actorLines.map((y, i) => (
        <div key={`h-${i}`} className="lane-grid-line lane-grid-line-horizontal" style={{ top: y }} />
      ))}
    </div>
  )
}

export function PhaseHeaderNode({ data }: NodeProps) {
  // La largeur vient de computeLayout (data.width) : une phase qui a
  // besoin de plusieurs sous-colonnes (plusieurs activités concurrentes
  // d'un même acteur, ou une réservation manuelle via le bouton "+"
  // ci-dessous) a un en-tête plus large, pas une largeur fixe. Le clic
  // sur le bouton est géré au niveau de ReactFlow (onNodeClick, voir
  // ProcessDiagram.tsx), qui distingue le bouton du reste de l'en-tête
  // via son élément cible (event.target).
  const icon = data.icon as string
  const diffStatus = data.diffStatus as DiffStatus | undefined
  return (
    <div
      className={`lane-node phase-header${diffStatus ? ` lane-node-diff-${diffStatus}` : ''}`}
      style={{ width: (data.width as number) - 8, height: PHASE_HEADER_HEIGHT - 8 }}
    >
      {/* Emoji illustrant concrètement la phase (mode storyboard,
          ADR-059) — absent pour une phase sans icône (jamais générée
          artificiellement), qui garde simplement son nom centré. */}
      {icon && (
        <span className="phase-header-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <span className="phase-header-label">{data.label as string}</span>
      {/* Étiquette de comparaison (voir DIFF_LABELS ci-dessus) — même
          patron que .actor-header-backstage-tag, couleur selon le statut. */}
      {diffStatus && <span className={`lane-node-diff-tag lane-node-diff-tag-${diffStatus}`}>{DIFF_LABELS[diffStatus]}</span>}
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
  const backstage = data.backstage as boolean
  const diffStatus = data.diffStatus as DiffStatus | undefined
  return (
    <div
      className={`lane-node actor-header${diffStatus ? ` lane-node-diff-${diffStatus}` : ''}`}
      style={{ width: LANE_LABEL_WIDTH - 8, height: (data.height as number) - 8, borderLeftColor: data.color as string }}
    >
      {data.label as string}
      {/* Étiquette discrète plutôt qu'une icône : "back-stage" seul, sans
          nom d'acteur, se lirait mal en un coup d'œil (voir ADR-064) — un
          acteur front-stage n'a lui aucune étiquette (comportement par
          défaut, pas besoin d'être signalé). */}
      {backstage && <span className="actor-header-backstage-tag">back-stage</span>}
      {diffStatus && <span className={`lane-node-diff-tag lane-node-diff-tag-${diffStatus}`}>{DIFF_LABELS[diffStatus]}</span>}
      <button type="button" className="add-sublane-button" title="Ajouter une ligne pour ce persona">
        +
      </button>
    </div>
  )
}

// Séparateur visuel entre acteurs front-stage (au-dessus) et back-stage
// (en dessous) — service blueprint, ADR-064. Un simple trait pointillé
// pleine largeur avec une étiquette, sans interaction : positionné par
// computeLayout uniquement quand les deux groupes sont non vides.
export function VisibilityLineNode({ data }: NodeProps) {
  return (
    <div className="visibility-line" style={{ width: data.width as number }}>
      <span className="visibility-line-label">Ligne de visibilité</span>
    </div>
  )
}

// Un emoji par score de satisfaction (1 = très insatisfait, index 0, à 5 =
// très satisfait, index 4) — se passe de légende, contrairement à un point
// de couleur seul.
const SATISFACTION_EMOJI = ['😞', '😕', '😐', '🙂', '😄']
const SATISFACTION_LABELS = ['Très insatisfait', 'Insatisfait', 'Neutre', 'Satisfait', 'Très satisfait']

// Mappe un score 1-5 sur une position verticale dans la zone de tracé
// (SATISFACTION_CURVE_HEIGHT, layout.ts) — 5 en haut, 1 en bas, avec une
// marge de 8px de chaque côté pour que le point/l'emoji ne touche jamais
// le bord.
function satisfactionY(score: number): number {
  const usable = SATISFACTION_CURVE_HEIGHT - 16
  return 8 + usable * (1 - (score - 1) / 4)
}

// Ligne combinée durée + courbe de satisfaction, une par diagramme
// (ADR-065, fusion des backlog #6 "courbe de satisfaction" et #9 "durée
// par étape") — placée au-dessus des en-têtes de phase (position en Y
// négatif, voir computeLayout). Un seul nœud pleine largeur plutôt qu'une
// cellule par phase : la courbe doit tracer un trait continu d'un point à
// l'autre, ce qui suppose de connaître la position de TOUTES les phases
// dans un même repère — impossible à faire proprement avec des nœuds
// React Flow séparés (chacun ignore la position des autres). Les phases
// sans score renseigné sont simplement absentes du tracé (le trait relie
// les points existants, sans casser la courbe sur un simple "non
// renseigné" — voir PhaseMetricEntry, layout.ts).
export function SatisfactionRowNode({ data }: NodeProps) {
  const width = data.width as number
  const phases = data.phases as PhaseMetricEntry[]
  const scored = phases.filter((p) => p.satisfactionScore > 0)
  const points = scored.map((p) => `${p.x + p.width / 2},${satisfactionY(p.satisfactionScore)}`).join(' ')

  return (
    <div className="satisfaction-row" style={{ width }}>
      <div className="satisfaction-row-label" style={{ width: LANE_LABEL_WIDTH }}>
        Durée &amp; satisfaction
      </div>
      <svg className="satisfaction-row-curve" width={width} height={SATISFACTION_CURVE_HEIGHT} aria-hidden="true">
        {scored.length > 1 && <polyline points={points} className="satisfaction-row-polyline" />}
        {scored.map((p) => (
          <text
            key={p.id}
            x={p.x + p.width / 2}
            y={satisfactionY(p.satisfactionScore)}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={17}
          >
            <title>{SATISFACTION_LABELS[p.satisfactionScore - 1]}</title>
            {SATISFACTION_EMOJI[p.satisfactionScore - 1]}
          </text>
        ))}
      </svg>
      {phases.map(
        (p) =>
          p.duration && (
            <div key={p.id} className="satisfaction-row-duration" style={{ left: p.x, width: p.width }}>
              ⏱ {p.duration}
            </div>
          ),
      )}
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
  const branchCount = data.branchCount as number
  const color = data.color as string
  const diffStatus = data.diffStatus as DiffStatus | undefined
  return (
    <div
      className={`activity-card${diffStatus ? ` activity-card-diff-${diffStatus}` : ''}`}
      style={{ borderTopColor: color, borderLeftColor: color, ['--card-color' as string]: color }}
    >
      {/* Étiquette de comparaison (voir DIFF_LABELS ci-dessus) — chevauche
          le bord bas de la carte, seul bord encore libre (les deux coins
          hauts portent déjà les badges point de friction/embranchement
          ci-dessous). */}
      {diffStatus && (
        <span className={`activity-card-diff-badge activity-card-diff-badge-${diffStatus}`}>{DIFF_LABELS[diffStatus]}</span>
      )}
      {/* Signale, sans avoir à ouvrir la carte, qu'au moins un point de
          friction a été noté (voir ActivityDetailModal.tsx, ADR-053). */}
      {painPointCount > 0 && (
        <span
          className="activity-card-warning"
          title={`${painPointCount} point${painPointCount > 1 ? 's' : ''} de friction`}
        >
          <TriangleAlert size={13} aria-hidden="true" />
        </span>
      )}
      {/* Signale qu'au moins une interaction sortante ne se produit que
          sous condition (embranchement, ADR-060) — coin haut-gauche pour
          ne jamais se confondre avec le badge de points de friction. */}
      {branchCount > 0 && (
        <span
          className="activity-card-branch"
          title={`${branchCount} embranchement${branchCount > 1 ? 's' : ''} conditionnel${branchCount > 1 ? 's' : ''}`}
        >
          <GitBranch size={12} aria-hidden="true" />
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
      <TriangleAlert size={14} aria-hidden="true" /> Points de friction
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
  laneGrid: LaneGridNode,
  phaseHeader: PhaseHeaderNode,
  actorHeader: ActorHeaderNode,
  painPointRowLabel: PainPointRowLabelNode,
  painPointCell: PainPointCellNode,
  activity: ActivityNode,
  addPhase: AddPhaseNode,
  addActivity: AddActivityNode,
  visibilityLine: VisibilityLineNode,
  satisfactionRow: SatisfactionRowNode,
}
