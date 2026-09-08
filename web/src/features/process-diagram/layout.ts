import type { Project } from '../../api/types'

export const LANE_LABEL_WIDTH = 190
export const PHASE_HEADER_HEIGHT = 60
export const COLUMN_WIDTH = 260
export const ROW_HEIGHT = 150
export const CARD_MARGIN = 16

export interface LayoutNode {
  id: string
  type: 'phaseHeader' | 'actorHeader' | 'activity'
  position: { x: number; y: number }
  data: Record<string, unknown>
  draggable: false
  selectable: boolean
}

export interface LayoutEdge {
  id: string
  source: string
  target: string
  label: string
}

// Calcule une disposition en swimlanes : les phases forment les colonnes
// (triées par `order`), les acteurs forment les lignes, et chaque activité
// est placée dans la cellule (acteur, phase) correspondante. Plusieurs
// activités du même acteur dans la même phase s'empilent verticalement.
export function computeLayout(project: Project): { nodes: LayoutNode[]; edges: LayoutEdge[] } {
  const phases = [...project.phases].sort((a, b) => a.order - b.order)
  const actors = project.actors

  const phaseIndex = new Map(phases.map((p, i) => [p.id, i]))
  const actorIndex = new Map(actors.map((a, i) => [a.id, i]))

  const nodes: LayoutNode[] = []

  phases.forEach((phase, i) => {
    nodes.push({
      id: `phase-header-${phase.id}`,
      type: 'phaseHeader',
      position: { x: LANE_LABEL_WIDTH + i * COLUMN_WIDTH, y: 0 },
      data: { label: phase.name },
      draggable: false,
      selectable: false,
    })
  })

  actors.forEach((actor, i) => {
    nodes.push({
      id: `actor-header-${actor.id}`,
      type: 'actorHeader',
      position: { x: 0, y: PHASE_HEADER_HEIGHT + i * ROW_HEIGHT },
      data: { label: actor.name, color: actor.color },
      draggable: false,
      selectable: false,
    })
  })

  const stacking = new Map<string, number>() // clé "actorId:phaseId" -> nombre déjà placé
  const activitiesByOrder = [...project.activities].sort((a, b) => a.order - b.order)

  for (const activity of activitiesByOrder) {
    const pi = phaseIndex.get(activity.phaseId)
    const ai = actorIndex.get(activity.actorId)
    if (pi === undefined || ai === undefined) continue // acteur/phase supprimé entre-temps

    const key = `${activity.actorId}:${activity.phaseId}`
    const stackPos = stacking.get(key) ?? 0
    stacking.set(key, stackPos + 1)

    const actor = actors[ai]
    nodes.push({
      id: activity.id,
      type: 'activity',
      position: {
        x: LANE_LABEL_WIDTH + pi * COLUMN_WIDTH + CARD_MARGIN,
        y: PHASE_HEADER_HEIGHT + ai * ROW_HEIGHT + CARD_MARGIN + stackPos * 56,
      },
      data: {
        label: activity.name,
        color: actor.color,
        storyCount: activity.userStories.length,
        specCount: activity.traceLinks.length,
      },
      draggable: false,
      selectable: true,
    })
  }

  const activityIds = new Set(project.activities.map((a) => a.id))
  const edges: LayoutEdge[] = project.interactions
    .filter((i) => activityIds.has(i.fromActivityId) && activityIds.has(i.toActivityId))
    .map((i) => ({
      id: i.id,
      source: i.fromActivityId,
      target: i.toActivityId,
      label: i.information,
    }))

  return { nodes, edges }
}
