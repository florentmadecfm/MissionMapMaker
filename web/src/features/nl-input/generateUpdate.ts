import { api } from '../../api/client'
import type { Project } from '../../api/types'
import { mergeDraft } from './mergeDraft'

// Doit rester cohérent avec maxTextLength côté serveur
// (internal/service/generate_service.go) : au-delà, la génération est de
// toute façon rejetée.
const MAX_TEXT_LENGTH = 20000
// Laisse toujours assez de place à la demande elle-même (potentiellement
// longue — texte collé, PDF extrait...) : le contexte est tronqué en
// premier si la somme dépasse MAX_TEXT_LENGTH.
const MAX_CONTEXT_LENGTH = 12000

// Décrit le processus déjà présent dans le projet ouvert, dans un format
// que le LLM peut reprendre tel quel (mêmes noms exacts) — voir
// DefaultProcessPrompt (internal/llm/prompts.go), qui explique comment
// distinguer ajouts et modifications à partir de ce contexte. Chaîne vide
// pour un projet encore sans acteur/phase/activité : la génération se
// comporte alors exactement comme une génération initiale (onglet
// Générer sur un projet vide), sans bloc de contexte superflu.
export function buildProjectContext(project: Project): string {
  if (project.actors.length === 0 && project.phases.length === 0 && project.activities.length === 0) {
    return ''
  }

  const lines: string[] = ['### Processus déjà existant (à ne jamais dupliquer — voir consignes)']

  if (project.actors.length > 0) {
    lines.push(`Acteurs : ${project.actors.map((a) => a.name).join(', ')}`)
  }
  if (project.phases.length > 0) {
    const sorted = [...project.phases].sort((a, b) => a.order - b.order)
    lines.push(`Phases (dans l'ordre) : ${sorted.map((p) => p.name).join(', ')}`)
  }
  if (project.activities.length > 0) {
    const actorNameById = new Map(project.actors.map((a) => [a.id, a.name]))
    const phaseNameById = new Map(project.phases.map((p) => [p.id, p.name]))
    lines.push('Activités :')
    for (const activity of project.activities) {
      const actorName = actorNameById.get(activity.actorId) ?? '?'
      const phaseName = phaseNameById.get(activity.phaseId) ?? '?'
      lines.push(`- "${activity.name}" (acteur : ${actorName}, phase : ${phaseName})`)
    }
  }

  let context = lines.join('\n')
  if (context.length > MAX_CONTEXT_LENGTH) {
    context = `${context.slice(0, MAX_CONTEXT_LENGTH)}\n… (contexte tronqué)`
  }
  return context
}

// Point d'entrée commun aux deux zones de saisie en langage naturel qui
// peuvent s'appliquer à un projet déjà rempli (l'onglet "Générer" comme la
// barre de mise à jour du diagramme, ADR-038) : sans le contexte du
// processus déjà existant, le LLM ne peut ni éviter les doublons, ni
// exprimer une modification (ex. "améliore la description de X") autrement
// qu'en la laissant sans effet, faute d'avoir connaissance de ce qui existe
// déjà (voir ADR-040).
export async function generateAndMerge(project: Project, text: string): Promise<Project> {
  const context = buildProjectContext(project)
  let composite = context ? `${context}\n\n### Demande de mise à jour\n${text}` : text
  if (composite.length > MAX_TEXT_LENGTH) {
    composite = composite.slice(0, MAX_TEXT_LENGTH)
  }
  const draft = await api.generateFromText(composite)
  return mergeDraft(project, draft)
}
