import type { Project } from '../../api/types'

export const LANE_LABEL_WIDTH = 190
// Assez haut pour l'emoji illustratif d'une phase (mode storyboard,
// ADR-059) au-dessus de son nom — une phase sans icône garde simplement
// son nom centré dans cette même hauteur, sans repli visuel forcé.
export const PHASE_HEADER_HEIGHT = 112
// Largeur d'une sous-colonne : l'espace réservé à une activité au sein
// d'une phase. Une phase qui a besoin de plusieurs sous-colonnes (voir
// computeLayout) voit sa largeur totale — et son en-tête — s'étendre d'un
// multiple de SUBCOLUMN_WIDTH plutôt que de rester figée à une seule.
export const SUBCOLUMN_WIDTH = 300
// Hauteur d'une sous-ligne : l'espace réservé à une activité au sein de la
// ligne d'un acteur. Un acteur qui a plusieurs sous-lignes (Actor.subLanes,
// ou une activité positionnée sur Activity.subRow > 0) voit sa ligne totale
// — et son en-tête — s'étendre d'un multiple de SUBLANE_HEIGHT, symétrique
// de SUBCOLUMN_WIDTH mais sur l'axe vertical.
export const SUBLANE_HEIGHT = 160
export const CARD_MARGIN = 16
// Largeur fixe (voir .activity-card en CSS) et hauteur approximative d'une
// carte d'activité, utilisées uniquement pour estimer un point central par
// carte (repère du dégradé des flèches, cf. LayoutEdge.gradient) : la
// hauteur réelle varie légèrement avec le contenu, mais une approximation
// suffit pour orienter un dégradé de couleur.
// Exportées : réutilisées par ProcessDiagram.tsx pour convertir la
// position de dépose d'une carte glissée-déposée en cellule (acteur,
// phase) cible — voir computeDropTarget.
export const CARD_WIDTH = 210
export const CARD_HEIGHT_ESTIMATE = 60

// Espace encore libre dans une case (sous-colonne/sous-ligne) une fois la
// carte posée à sa position par défaut (voir CARD_MARGIN ci-dessus) :
// borne le décalage fin (Activity.offsetX/offsetY, ADR-051) pour qu'une
// carte nudgée ne chevauche jamais la case voisine. CARD_HEIGHT_ESTIMATE
// n'étant qu'une approximation (voir plus haut), la borne verticale l'est
// aussi — tolérable pour un simple ajustement visuel.
export const MAX_OFFSET_X = SUBCOLUMN_WIDTH - CARD_WIDTH - CARD_MARGIN
export const MAX_OFFSET_Y = SUBLANE_HEIGHT - CARD_HEIGHT_ESTIMATE - CARD_MARGIN

// Hauteur de la ligne de synthèse des points de friction, tout en bas du
// diagramme (une cellule par phase, largeur alignée sur PhaseHeaderNode —
// voir computeLayout) : fixe plutôt que dépendante du nombre de points de
// friction de chaque phase (qui varie), avec défilement interne
// (overflow-y, voir process-diagram.css) au-delà — même compromis que
// CARD_HEIGHT_ESTIMATE ailleurs dans ce fichier, simplicité du calcul de
// disposition plutôt qu'une hauteur dynamique par cellule.
export const PAIN_POINT_ROW_HEIGHT = 160

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

// Largeur du bouton "+" ajouté après la dernière phase, pour ajouter une
// phase (en tête) ou une activité pour l'acteur de la ligne (le reste de
// la colonne) directement depuis le diagramme — voir ProcessDiagram.tsx.
export const ADD_LANE_WIDTH = 130

// Nombre de points d'ancrage répartis verticalement de chaque côté d'une
// carte d'activité (voir nodes.tsx) : plusieurs interactions partant/
// arrivant sur le même acteur/activité sont ainsi réparties sur des
// points différents plutôt que de toutes converger au même endroit, ce
// qui évite que les flèches se superposent.
export const HANDLES_PER_SIDE = 3

export interface LayoutNode {
  id: string
  type: 'phaseHeader' | 'actorHeader' | 'activity' | 'addPhase' | 'addActivity' | 'painPointRowLabel' | 'painPointCell'
  position: { x: number; y: number }
  data: Record<string, unknown>
  // Seules les cartes d'activité sont déplaçables (glisser-déposer pour
  // réassigner acteur/phase, voir computeDropTarget) ; les en-têtes de
  // ligne/colonne restent fixes.
  draggable: boolean
  selectable: boolean
}

// Un point de friction affiché dans la ligne de synthèse (PainPointCellNode,
// voir nodes.tsx) : conserve le contexte (acteur, activité) perdu par le
// simple regroupement par phase, pour rester lisible une fois sorti de sa
// carte d'origine.
export interface PainPointRowEntry {
  activityId: string
  activityName: string
  actorName: string
  actorColor: string
  text: string
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  label: string
  // Couleur de l'acteur au départ (source) et à l'arrivée (target) de
  // l'interaction : les deux bouts de la flèche restent identifiables même
  // quand ils traversent plusieurs acteurs, en écho à la couleur de bordure
  // des cartes d'activité (voir nodes.tsx).
  sourceColor: string
  targetColor: string
  // Repères (en coordonnées internes du canevas, "userSpaceOnUse") du
  // centre de la carte de départ et de celle d'arrivée : sert d'axe au
  // dégradé de couleur de la flèche. Un dégradé en pourcentage relatif à
  // la boîte englobante du tracé (objectBoundingBox) ne fonctionne pas ici
  // : les tracés "smoothstep" sont faits de segments droits horizontaux ou
  // verticaux, dont la boîte englobante a une largeur ou une hauteur nulle
  // sur ces segments — un dégradé objectBoundingBox y devient invisible.
  gradient: { x1: number; y1: number; x2: number; y2: number }
}

// Résout, pour chaque activité, sa sous-colonne finale au sein de sa
// cellule (acteur, phase, sous-ligne — voir `subRow`, chaque sous-ligne
// empile ses propres sous-colonnes indépendamment des autres). Les
// activités dont `column` a été fixé explicitement (> 0, via
// glisser-déposer — voir ProcessDiagram.tsx) gardent cette valeur telle
// quelle, même seules dans leur cellule : c'est ce qui permet à une
// activité isolée de s'aligner sur une sous-colonne qu'un autre acteur a
// fait apparaître dans la phase. Les autres (`column` à 0, la valeur par
// défaut y compris pour les projets enregistrés avant l'introduction de
// ce champ) sont réparties automatiquement, dans leur ordre relatif
// (`order`), sur les sous-colonnes encore libres de leur acteur dans
// cette phase — en sautant celles déjà prises par une activité du même
// acteur positionnée explicitement.
function resolveColumns(activities: Project['activities']): Map<string, number> {
  const byCell = new Map<string, Project['activities']>()
  for (const activity of activities) {
    const key = `${activity.actorId}:${activity.phaseId}:${Math.max(activity.subRow, 0)}`
    const list = byCell.get(key) ?? []
    list.push(activity)
    byCell.set(key, list)
  }

  const result = new Map<string, number>()
  for (const cellActivities of byCell.values()) {
    const sorted = [...cellActivities].sort((a, b) => a.order - b.order)
    const usedColumns = new Set<number>()
    for (const a of sorted) {
      if (a.column > 0) {
        result.set(a.id, a.column)
        usedColumns.add(a.column)
      }
    }
    let nextFree = 0
    for (const a of sorted) {
      if (a.column > 0) continue
      while (usedColumns.has(nextFree)) nextFree++
      result.set(a.id, nextFree)
      usedColumns.add(nextFree)
      nextFree++
    }
  }
  return result
}

// Calcule une disposition en swimlanes : les phases forment les colonnes
// (triées par `order`), les acteurs forment les lignes, et chaque activité
// est placée dans la cellule (acteur, phase, sous-ligne) correspondante.
//
// Quand un acteur a plusieurs activités concurrentes dans la même phase
// (même sous-ligne), celles-ci sont réparties sur des sous-colonnes côte
// à côte plutôt qu'empilées verticalement dans une case étroite : la
// phase s'élargit d'autant (jusqu'à la plus grande sous-colonne utilisée
// par n'importe quel acteur dans cette phase — voir resolveColumns).
// Symétriquement, un acteur peut avoir plusieurs sous-lignes (réservées
// manuellement via Actor.subLanes, ou occupées via Activity.subRow) : sa
// ligne s'étend alors d'autant, sur toute la largeur du diagramme (toutes
// les phases partagent les mêmes sous-lignes d'un acteur donné) — ce qui
// garde le diagramme lisible même quand une phase ou un acteur concentre
// beaucoup d'activités.
export function computeLayout(project: Project): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const phases = [...project.phases].sort((a, b) => a.order - b.order)
  const actors = project.actors

  const phaseIndex = new Map(phases.map((p, i) => [p.id, i]))
  const actorIndex = new Map(actors.map((a, i) => [a.id, i]))
  const actorById = new Map(actors.map((a) => [a.id, a]))

  const activityColumn = resolveColumns(project.activities)

  // Largeur de chaque phase : un multiple de SUBCOLUMN_WIDTH couvrant la
  // plus grande sous-colonne effectivement utilisée dans cette phase
  // (explicite ou auto-assignée), au moins `phase.subColumns` (réservation
  // manuelle, voir ProcessDiagram.tsx), au moins 1.
  const subColumnsByPhase = new Map<string, number>()
  for (const phase of phases) {
    subColumnsByPhase.set(phase.id, Math.max(1, phase.subColumns))
  }
  for (const activity of project.activities) {
    const col = activityColumn.get(activity.id) ?? 0
    subColumnsByPhase.set(activity.phaseId, Math.max(subColumnsByPhase.get(activity.phaseId) ?? 1, col + 1))
  }

  // Hauteur de la ligne de chaque acteur : un multiple de SUBLANE_HEIGHT
  // couvrant la plus grande sous-ligne effectivement utilisée par cet
  // acteur (toutes phases confondues), au moins `actor.subLanes`
  // (réservation manuelle), au moins 1.
  const subLanesByActor = new Map<string, number>()
  for (const actor of actors) {
    subLanesByActor.set(actor.id, Math.max(1, actor.subLanes))
  }
  for (const activity of project.activities) {
    subLanesByActor.set(activity.actorId, Math.max(subLanesByActor.get(activity.actorId) ?? 1, activity.subRow + 1))
  }

  const phaseWidths = phases.map((p) => (subColumnsByPhase.get(p.id) ?? 1) * SUBCOLUMN_WIDTH)
  const phaseOffsets: number[] = []
  let phaseCumulative = LANE_LABEL_WIDTH
  for (const w of phaseWidths) {
    phaseOffsets.push(phaseCumulative)
    phaseCumulative += w
  }

  const actorHeights = actors.map((a) => (subLanesByActor.get(a.id) ?? 1) * SUBLANE_HEIGHT)
  const actorOffsets: number[] = []
  let actorCumulative = PHASE_HEADER_HEIGHT
  for (const h of actorHeights) {
    actorOffsets.push(actorCumulative)
    actorCumulative += h
  }

  const nodes: LayoutNode[] = []

  phases.forEach((phase, i) => {
    nodes.push({
      id: `phase-header-${phase.id}`,
      type: 'phaseHeader',
      position: { x: phaseOffsets[i], y: 0 },
      data: { label: phase.name, icon: phase.icon, width: phaseWidths[i], phaseId: phase.id },
      draggable: false,
      selectable: false,
    })
  })

  actors.forEach((actor, i) => {
    nodes.push({
      id: `actor-header-${actor.id}`,
      type: 'actorHeader',
      position: { x: 0, y: actorOffsets[i] },
      data: { label: actor.name, color: actor.color, height: actorHeights[i], actorId: actor.id },
      draggable: false,
      selectable: false,
    })
  })

  // Ligne de synthèse des points de friction, tout en bas du diagramme
  // (sous la dernière ligne d'acteur) : une cellule par phase, largeur
  // alignée sur celle de son en-tête (comme les cartes d'activité),
  // regroupant les points de friction de TOUTES les activités de cette
  // phase, toutes acteurs confondus — chaque entrée reste étiquetée par
  // son acteur et son activité d'origine pour ne pas perdre ce contexte
  // (voir ADR-054).
  const painPointsByPhase = new Map<string, PainPointRowEntry[]>()
  for (const activity of project.activities) {
    if (activity.painPoints.length === 0) continue
    const actor = actorById.get(activity.actorId)
    const list = painPointsByPhase.get(activity.phaseId) ?? []
    for (const pp of activity.painPoints) {
      list.push({
        activityId: activity.id,
        activityName: activity.name,
        actorName: actor?.name ?? '(acteur supprimé)',
        actorColor: actor?.color ?? '#64748b',
        text: pp.text,
      })
    }
    painPointsByPhase.set(activity.phaseId, list)
  }
  nodes.push({
    id: 'pain-point-row-label',
    type: 'painPointRowLabel',
    position: { x: 0, y: actorCumulative },
    data: { height: PAIN_POINT_ROW_HEIGHT },
    draggable: false,
    selectable: false,
  })
  phases.forEach((phase, i) => {
    nodes.push({
      id: `pain-point-cell-${phase.id}`,
      type: 'painPointCell',
      position: { x: phaseOffsets[i], y: actorCumulative },
      data: { width: phaseWidths[i], entries: painPointsByPhase.get(phase.id) ?? [] },
      draggable: false,
      selectable: false,
    })
  })

  // Colonne "+" après la dernière phase : ajouter une phase (en tête,
  // même hauteur que les en-têtes de phase) ou une activité pour l'acteur
  // de la ligne (le reste de la colonne, une cellule par acteur) sans
  // repasser par l'onglet Édition.
  nodes.push({
    id: 'add-phase-button',
    type: 'addPhase',
    position: { x: phaseCumulative, y: 0 },
    data: { height: PHASE_HEADER_HEIGHT },
    draggable: false,
    selectable: false,
  })
  actors.forEach((actor, i) => {
    nodes.push({
      id: `add-activity-${actor.id}`,
      type: 'addActivity',
      position: { x: phaseCumulative, y: actorOffsets[i] },
      data: { actorId: actor.id, height: actorHeights[i] },
      draggable: false,
      selectable: false,
    })
  })

  const activitiesByOrder = [...project.activities].sort((a, b) => a.order - b.order)
  // Centre approximatif de chaque carte d'activité (voir gradient dans
  // LayoutEdge), rempli au fur et à mesure du placement ci-dessous.
  const activityCenters = new Map<string, { x: number; y: number }>()

  for (const activity of activitiesByOrder) {
    const pi = phaseIndex.get(activity.phaseId)
    const ai = actorIndex.get(activity.actorId)
    if (pi === undefined || ai === undefined) continue // acteur/phase supprimé entre-temps

    const stackPos = activityColumn.get(activity.id) ?? 0
    const subRow = Math.max(activity.subRow, 0)

    const actor = actors[ai]
    // Le décalage fin (ADR-051) ajuste la position À L'INTÉRIEUR de la
    // case sans jamais changer la case elle-même (stackPos/subRow
    // ci-dessus, seuls déterminés par actorId/phaseId/column/subRow) —
    // reborné ici (et non fait confiance tel quel) au cas où la case
    // effectivement disponible ait changé depuis l'enregistrement de ce
    // décalage (ex. import Excel d'une valeur arbitraire).
    const position = {
      x: phaseOffsets[pi] + stackPos * SUBCOLUMN_WIDTH + CARD_MARGIN + clamp(activity.offsetX, 0, MAX_OFFSET_X),
      y: actorOffsets[ai] + subRow * SUBLANE_HEIGHT + CARD_MARGIN + clamp(activity.offsetY, 0, MAX_OFFSET_Y),
    }
    activityCenters.set(activity.id, { x: position.x + CARD_WIDTH / 2, y: position.y + CARD_HEIGHT_ESTIMATE / 2 })
    nodes.push({
      id: activity.id,
      type: 'activity',
      position,
      data: {
        label: activity.name,
        color: actor.color,
        storyCount: activity.userStories.length,
        specCount: activity.traceLinks.length,
        painPointCount: activity.painPoints.length,
      },
      draggable: true,
      selectable: true,
    })
  }

  const activityIds = new Set(project.activities.map((a) => a.id))
  const activityById = new Map(project.activities.map((a) => [a.id, a]))

  // Répartit les poignées de sortie/entrée de chaque nœud sur
  // HANDLES_PER_SIDE points distincts (round-robin), pour que plusieurs
  // interactions partageant une même activité ne partent/arrivent pas
  // toutes exactement au même endroit.
  const handleCount = new Map<string, number>()
  const nextHandle = (nodeId: string, group: string) => {
    const key = `${nodeId}:${group}`
    const n = handleCount.get(key) ?? 0
    handleCount.set(key, n + 1)
    return `h${n % HANDLES_PER_SIDE}`
  }

  const edges: LayoutEdge[] = project.interactions
    .filter((i) => activityIds.has(i.fromActivityId) && activityIds.has(i.toActivityId))
    .map((i) => {
      const fromActivity = activityById.get(i.fromActivityId)
      const toActivity = activityById.get(i.toActivityId)
      const fromActor = actorById.get(fromActivity?.actorId ?? '')
      const toActor = actorById.get(toActivity?.actorId ?? '')

      // Les deux cartes tombent-elles dans la même sous-colonne de la même
      // phase (donc alignées verticalement) ? Route alors par le haut/bas
      // plutôt que les côtés, pour ne pas partager le couloir horizontal
      // utilisé par les interactions entre sous-colonnes ou phases
      // différentes. La comparaison se fait sur la position Y réelle des
      // cartes (activityCenters), pas sur l'index de ligne de l'acteur
      // seul : deux activités du même acteur mais de sous-lignes
      // différentes (voir subRow) doivent aussi être routées verticalement
      // entre elles, exactement comme deux acteurs différents.
      const sameColumn =
        fromActivity?.phaseId === toActivity?.phaseId &&
        activityColumn.get(i.fromActivityId) === activityColumn.get(i.toActivityId)
      const fromCenter = activityCenters.get(i.fromActivityId) ?? { x: 0, y: 0 }
      const toCenter = activityCenters.get(i.toActivityId) ?? { x: 0, y: 0 }
      const sameVerticalPosition = fromCenter.y === toCenter.y

      let sourceHandle: string
      let targetHandle: string
      if (sameColumn && !sameVerticalPosition) {
        const goingDown = toCenter.y > fromCenter.y
        sourceHandle = goingDown
          ? `bottom-out-${nextHandle(i.fromActivityId, 'bottom-out')}`
          : `top-out-${nextHandle(i.fromActivityId, 'top-out')}`
        targetHandle = goingDown
          ? `top-in-${nextHandle(i.toActivityId, 'top-in')}`
          : `bottom-in-${nextHandle(i.toActivityId, 'bottom-in')}`
      } else {
        sourceHandle = `out-${nextHandle(i.fromActivityId, 'out')}`
        targetHandle = `in-${nextHandle(i.toActivityId, 'in')}`
      }

      const gradient = { x1: fromCenter.x, y1: fromCenter.y, x2: toCenter.x, y2: toCenter.y }

      return {
        id: i.id,
        source: i.fromActivityId,
        target: i.toActivityId,
        sourceHandle,
        targetHandle,
        label: i.information,
        sourceColor: fromActor?.color ?? '#64748b',
        targetColor: toActor?.color ?? '#64748b',
        gradient,
      }
    })

  return { nodes, edges }
}

export interface DropTarget {
  actorId: string
  phaseId: string
  // Position souhaitée au sein de la pile de cette cellule (acteur,
  // phase, sous-ligne), déduite du décalage horizontal du point de dépose
  // au sein de la colonne de phase. Non bornée à la taille réelle de la
  // pile cible : à charge de l'appelant de la ramener dans l'intervalle
  // valide, qui dépend du nombre d'activités déjà présentes dans cette
  // cellule (en excluant celle qu'on déplace).
  subColumnIndex: number
  // Sous-ligne visée au sein de la ligne de l'acteur, déduite du décalage
  // vertical du point de dépose. Contrairement à subColumnIndex, toujours
  // utilisée telle quelle (pas d'empilement automatique sur cet axe, voir
  // Activity.subRow) — à charge de l'appelant de la ramener dans
  // l'intervalle réservé pour cet acteur si besoin.
  subRowIndex: number
}

// À partir de la position (coordonnées internes du canevas, celles que
// React Flow rapporte dans l'événement de fin de glisser-déposer) où une
// carte d'activité a été lâchée, détermine la cellule (acteur, phase,
// sous-ligne, sous-colonne) cible : la ligne d'acteur et la colonne de
// phase dont la bande contient le centre de la carte, puis la sous-ligne/
// sous-colonne au sein de cette bande. Un dépôt hors de la grille
// (au-dessus de la première ligne, à droite de la dernière phase, etc.)
// se rabat sur la ligne/colonne la plus proche plutôt que d'ignorer le
// geste — glisser une carte franchement à gauche ou à droite du canevas
// revient ainsi à la déposer dans la première ou la dernière phase.
//
// ownActorId/ownPhaseId (optionnels, l'acteur et la phase ACTUELS de la
// carte qu'on glisse) : sans eux, les bandes d'acteurs (verticalement) et
// de phases (horizontalement) étant contiguës (aucun espace entre elles),
// dépasser même légèrement le bord de sa propre ligne/colonne fait
// immédiatement basculer sur l'acteur/la phase SUIVANT(E) — un simple
// geste pour créer une seule "case" de plus (une sous-ligne pour son
// acteur, une sous-colonne pour sa phase) réassignait donc la carte à un
// acteur ou une phase entièrement différent(e). Avec ces deux paramètres,
// un dépôt qui déborde d'au plus une SUBLANE_HEIGHT/SUBCOLUMN_WIDTH au-delà
// de la zone déjà réservée par son propre acteur/sa propre phase y reste,
// sur la nouvelle sous-ligne/sous-colonne qui vient d'apparaître sous le
// curseur — un dépôt plus franc continue de basculer sur l'acteur/la phase
// suivant(e) comme avant (voir ADR-049, ADR-050).
export function computeDropTarget(
  project: Project,
  nodes: LayoutNode[],
  dropPosition: { x: number; y: number },
  ownActorId?: string,
  ownPhaseId?: string,
): DropTarget | null {
  const actorHeaders = nodes.filter((n) => n.type === 'actorHeader')
  const phaseHeaders = nodes.filter((n) => n.type === 'phaseHeader')
  if (actorHeaders.length === 0 || phaseHeaders.length === 0) return null

  // Le centre de la carte représente mieux l'intention de dépose que son
  // coin haut-gauche (la position brute rapportée par React Flow).
  const centerX = dropPosition.x + CARD_WIDTH / 2
  const centerY = dropPosition.y + CARD_HEIGHT_ESTIMATE / 2

  const ownHeader = ownActorId ? actorHeaders.find((n) => n.id === `actor-header-${ownActorId}`) : undefined
  const staysOwnActor =
    ownHeader !== undefined &&
    centerY >= ownHeader.position.y &&
    centerY < ownHeader.position.y + (ownHeader.data.height as number) + SUBLANE_HEIGHT

  const actorRow = staysOwnActor
    ? ownHeader
    : (actorHeaders.find((n) => centerY >= n.position.y && centerY < n.position.y + (n.data.height as number)) ??
      (centerY < actorHeaders[0].position.y ? actorHeaders[0] : actorHeaders[actorHeaders.length - 1]))

  const ownPhaseHeader = ownPhaseId ? phaseHeaders.find((n) => n.id === `phase-header-${ownPhaseId}`) : undefined
  const staysOwnPhase =
    ownPhaseHeader !== undefined &&
    centerX >= ownPhaseHeader.position.x &&
    centerX < ownPhaseHeader.position.x + (ownPhaseHeader.data.width as number) + SUBCOLUMN_WIDTH

  const phaseColumn = staysOwnPhase
    ? ownPhaseHeader
    : (phaseHeaders.find((n) => centerX >= n.position.x && centerX < n.position.x + (n.data.width as number)) ??
      (centerX < phaseHeaders[0].position.x ? phaseHeaders[0] : phaseHeaders[phaseHeaders.length - 1]))

  const actorId = actorRow.id.replace('actor-header-', '')
  const phaseId = phaseColumn.id.replace('phase-header-', '')
  if (!project.actors.some((a) => a.id === actorId) || !project.phases.some((p) => p.id === phaseId)) return null

  const subColumnIndex = Math.round((centerX - phaseColumn.position.x) / SUBCOLUMN_WIDTH)
  const subRowIndex = Math.round((centerY - actorRow.position.y) / SUBLANE_HEIGHT)

  return { actorId, phaseId, subColumnIndex, subRowIndex }
}

// Coin haut-gauche (mêmes coordonnées internes que LayoutNode.position) de
// la cellule visée par un DropTarget — sert à positionner l'aperçu de
// dépose (voir ProcessDiagram.tsx, "ombre" affichée sous la carte pendant
// le glisser). Réutilise les en-têtes déjà calculés par computeLayout
// plutôt que de refaire le calcul des largeurs/offsets de phase.
export function cellTopLeft(nodes: LayoutNode[], target: DropTarget): { x: number; y: number } | null {
  const actorHeader = nodes.find((n) => n.id === `actor-header-${target.actorId}`)
  const phaseHeader = nodes.find((n) => n.id === `phase-header-${target.phaseId}`)
  if (!actorHeader || !phaseHeader) return null

  return {
    x: phaseHeader.position.x + Math.max(target.subColumnIndex, 0) * SUBCOLUMN_WIDTH + CARD_MARGIN,
    y: actorHeader.position.y + Math.max(target.subRowIndex, 0) * SUBLANE_HEIGHT + CARD_MARGIN,
  }
}
