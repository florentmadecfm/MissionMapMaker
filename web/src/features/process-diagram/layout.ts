import type { Project } from '../../api/types'

export const LANE_LABEL_WIDTH = 190
export const PHASE_HEADER_HEIGHT = 60
// Largeur d'une sous-colonne : l'espace réservé à une activité au sein
// d'une phase. Une phase qui a besoin de plusieurs sous-colonnes (voir
// computeLayout) voit sa largeur totale — et son en-tête — s'étendre d'un
// multiple de SUBCOLUMN_WIDTH plutôt que de rester figée à une seule.
export const SUBCOLUMN_WIDTH = 300
export const ROW_HEIGHT = 160
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

// Nombre de points d'ancrage répartis verticalement de chaque côté d'une
// carte d'activité (voir nodes.tsx) : plusieurs interactions partant/
// arrivant sur le même acteur/activité sont ainsi réparties sur des
// points différents plutôt que de toutes converger au même endroit, ce
// qui évite que les flèches se superposent.
export const HANDLES_PER_SIDE = 3

export interface LayoutNode {
  id: string
  type: 'phaseHeader' | 'actorHeader' | 'activity'
  position: { x: number; y: number }
  data: Record<string, unknown>
  // Seules les cartes d'activité sont déplaçables (glisser-déposer pour
  // réassigner acteur/phase, voir computeDropTarget) ; les en-têtes de
  // ligne/colonne restent fixes.
  draggable: boolean
  selectable: boolean
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

// Calcule une disposition en swimlanes : les phases forment les colonnes
// (triées par `order`), les acteurs forment les lignes, et chaque activité
// est placée dans la cellule (acteur, phase) correspondante.
//
// Quand un acteur a plusieurs activités concurrentes dans la même phase,
// celles-ci sont réparties sur des sous-colonnes côte à côte plutôt
// qu'empilées verticalement dans une case étroite : la phase s'élargit
// d'autant (jusqu'au plus grand empilement de n'importe quel acteur dans
// cette phase), et toutes les lignes d'acteur restent à hauteur fixe — ce
// qui garde le diagramme lisible même quand une phase concentre beaucoup
// d'activités réparties entre plusieurs acteurs.
export function computeLayout(project: Project): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const phases = [...project.phases].sort((a, b) => a.order - b.order)
  const actors = project.actors

  const phaseIndex = new Map(phases.map((p, i) => [p.id, i]))
  const actorIndex = new Map(actors.map((a, i) => [a.id, i]))
  const actorById = new Map(actors.map((a) => [a.id, a]))

  // 1ère passe : compte les activités par (acteur, phase) pour déterminer,
  // pour chaque phase, le nombre de sous-colonnes nécessaires (le plus
  // grand nombre d'activités qu'un même acteur a dans cette phase).
  const stackCounts = new Map<string, number>() // "actorId:phaseId" -> nombre d'activités
  for (const activity of project.activities) {
    const key = `${activity.actorId}:${activity.phaseId}`
    stackCounts.set(key, (stackCounts.get(key) ?? 0) + 1)
  }

  const subColumnsByPhase = new Map<string, number>()
  for (const [key, count] of stackCounts) {
    const phaseId = key.split(':')[1]
    subColumnsByPhase.set(phaseId, Math.max(subColumnsByPhase.get(phaseId) ?? 1, count))
  }

  const phaseWidths = phases.map((p) => (subColumnsByPhase.get(p.id) ?? 1) * SUBCOLUMN_WIDTH)
  const phaseOffsets: number[] = []
  let phaseCumulative = LANE_LABEL_WIDTH
  for (const w of phaseWidths) {
    phaseOffsets.push(phaseCumulative)
    phaseCumulative += w
  }

  const nodes: LayoutNode[] = []

  phases.forEach((phase, i) => {
    nodes.push({
      id: `phase-header-${phase.id}`,
      type: 'phaseHeader',
      position: { x: phaseOffsets[i], y: 0 },
      data: { label: phase.name, width: phaseWidths[i] },
      draggable: false,
      selectable: false,
    })
  })

  actors.forEach((actor, i) => {
    nodes.push({
      id: `actor-header-${actor.id}`,
      type: 'actorHeader',
      position: { x: 0, y: PHASE_HEADER_HEIGHT + i * ROW_HEIGHT },
      data: { label: actor.name, color: actor.color, height: ROW_HEIGHT },
      draggable: false,
      selectable: false,
    })
  })

  const stacking = new Map<string, number>() // clé "actorId:phaseId" -> nombre déjà placé (= index de sous-colonne)
  const activitiesByOrder = [...project.activities].sort((a, b) => a.order - b.order)
  // Centre approximatif de chaque carte d'activité (voir gradient dans
  // LayoutEdge), rempli au fur et à mesure du placement ci-dessous.
  const activityCenters = new Map<string, { x: number; y: number }>()
  // Sous-colonne où chaque activité a été placée au sein de sa phase :
  // sert, pour une interaction, à distinguer deux cartes alignées
  // verticalement (même phase, même sous-colonne) de deux cartes que la
  // répartition en sous-colonnes a déplacées côte à côte — voir plus bas.
  const activitySubColumn = new Map<string, number>()

  for (const activity of activitiesByOrder) {
    const pi = phaseIndex.get(activity.phaseId)
    const ai = actorIndex.get(activity.actorId)
    if (pi === undefined || ai === undefined) continue // acteur/phase supprimé entre-temps

    const key = `${activity.actorId}:${activity.phaseId}`
    const stackPos = stacking.get(key) ?? 0
    stacking.set(key, stackPos + 1)
    activitySubColumn.set(activity.id, stackPos)

    const actor = actors[ai]
    const position = {
      x: phaseOffsets[pi] + stackPos * SUBCOLUMN_WIDTH + CARD_MARGIN,
      y: PHASE_HEADER_HEIGHT + ai * ROW_HEIGHT + CARD_MARGIN,
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
      // différentes.
      const sameColumn =
        fromActivity?.phaseId === toActivity?.phaseId &&
        activitySubColumn.get(i.fromActivityId) === activitySubColumn.get(i.toActivityId)
      const fromRow = actorIndex.get(fromActivity?.actorId ?? '') ?? 0
      const toRow = actorIndex.get(toActivity?.actorId ?? '') ?? 0

      let sourceHandle: string
      let targetHandle: string
      if (sameColumn && fromRow !== toRow) {
        const goingDown = toRow > fromRow
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

      const fromCenter = activityCenters.get(i.fromActivityId) ?? { x: 0, y: 0 }
      const toCenter = activityCenters.get(i.toActivityId) ?? { x: 0, y: 0 }
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
  // phase), déduite du décalage horizontal du point de dépose au sein de
  // la colonne de phase. Non bornée à la taille réelle de la pile cible :
  // à charge de l'appelant de la ramener dans l'intervalle valide, qui
  // dépend du nombre d'activités déjà présentes dans cette cellule (en
  // excluant celle qu'on déplace).
  subColumnIndex: number
}

// À partir de la position (coordonnées internes du canevas, celles que
// React Flow rapporte dans l'événement de fin de glisser-déposer) où une
// carte d'activité a été lâchée, détermine la cellule (acteur, phase)
// cible : la ligne d'acteur et la colonne de phase dont la bande contient
// le centre de la carte. Un dépôt hors de la grille (au-dessus de la
// première ligne, à droite de la dernière phase, etc.) se rabat sur la
// ligne/colonne la plus proche plutôt que d'ignorer le geste — glisser
// une carte franchement à gauche ou à droite du canevas revient ainsi à
// la déposer dans la première ou la dernière phase.
export function computeDropTarget(
  project: Project,
  nodes: LayoutNode[],
  dropPosition: { x: number; y: number },
): DropTarget | null {
  const actorHeaders = nodes.filter((n) => n.type === 'actorHeader')
  const phaseHeaders = nodes.filter((n) => n.type === 'phaseHeader')
  if (actorHeaders.length === 0 || phaseHeaders.length === 0) return null

  // Le centre de la carte représente mieux l'intention de dépose que son
  // coin haut-gauche (la position brute rapportée par React Flow).
  const centerX = dropPosition.x + CARD_WIDTH / 2
  const centerY = dropPosition.y + CARD_HEIGHT_ESTIMATE / 2

  const actorRow =
    actorHeaders.find((n) => centerY >= n.position.y && centerY < n.position.y + ROW_HEIGHT) ??
    (centerY < actorHeaders[0].position.y ? actorHeaders[0] : actorHeaders[actorHeaders.length - 1])
  const phaseColumn =
    phaseHeaders.find((n) => centerX >= n.position.x && centerX < n.position.x + (n.data.width as number)) ??
    (centerX < phaseHeaders[0].position.x ? phaseHeaders[0] : phaseHeaders[phaseHeaders.length - 1])

  const actorId = actorRow.id.replace('actor-header-', '')
  const phaseId = phaseColumn.id.replace('phase-header-', '')
  if (!project.actors.some((a) => a.id === actorId) || !project.phases.some((p) => p.id === phaseId)) return null

  const subColumnIndex = Math.round((centerX - phaseColumn.position.x) / SUBCOLUMN_WIDTH)

  return { actorId, phaseId, subColumnIndex }
}
