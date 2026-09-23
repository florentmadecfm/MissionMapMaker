import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { classifyGenerationError } from '../../api/generationErrors'
import type { Activity, DraftPainPointSolution, PainPoint, PainPointChangeType, PainPointContext, Project } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { applyPainPointResolution } from '../specifications/mergePainPointResolution'

interface Props {
  project: Project
  activity: Activity
  painPoint: PainPoint
  onChange: (project: Project) => void
  onClose: () => void
  // true quand `project` EST déjà la cible (vue Cible active, voir
  // activeVariant.ts) — sinon le changement structurel de la solution
  // choisie est dirigé vers la cible de la mission, créée au besoin.
  isTargetActive: boolean
}

const CHANGE_TYPE_LABELS: Record<PainPointChangeType, string> = {
  add_interaction: '+ Interaction',
  remove_interaction: '− Interaction',
  add_activity: '+ Activité',
  remove_activity: '− Activité',
  merge_activities: 'Fusion d’activités',
}

type Status = 'loading' | 'ready' | 'resolving' | 'done' | 'not-configured' | 'rate-limited'

// Ouverte depuis ActivityDetailModal.tsx sur un point de friction pas
// encore résolu : flux en 2 temps (ADR-066). D'abord 5 propositions de
// solutions STRUCTURELLES (le LLM décrit un changement — ajout/suppression
// d'interaction, ajout/suppression/fusion d'activités — mais ne modifie
// JAMAIS le diagramme lui-même, cohérent avec le reste de l'app : une
// proposition à choisir, jamais appliquée automatiquement). Puis, une fois
// une solution choisie, une SSS + un scénario de test qui la formalisent,
// ajoutés au projet et reliés à l'activité ET au point de friction
// (PainPoint.resolvedBySpecId) via mergePainPointResolution.
export function PainPointSolutionsModal({ project, activity, painPoint, onChange, onClose, isTargetActive }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [solutions, setSolutions] = useState<DraftPainPointSolution[]>([])
  const [error, setError] = useState<string | null>(null)
  const [addedCodes, setAddedCodes] = useState<{ spec: string; test: string } | null>(null)
  const [diagramChangeApplied, setDiagramChangeApplied] = useState(false)
  // Description de la solution choisie (voir chooseSolution) — reprise
  // dans le message final quand le changement structurel n'a pas pu être
  // appliqué automatiquement, pour que l'utilisateur sache concrètement
  // quoi reproduire à la main plutôt qu'une phrase générique sans détail.
  const [chosenDescription, setChosenDescription] = useState('')

  const actor = project.actors.find((a) => a.id === activity.actorId)
  const phase = project.phases.find((p) => p.id === activity.phaseId)

  function buildContext(): PainPointContext {
    return {
      activityName: activity.name,
      actorName: actor?.name ?? '',
      phaseName: phase?.name ?? '',
      painPointText: painPoint.text,
      activities: project.activities.map((a) => ({
        name: a.name,
        actorName: project.actors.find((x) => x.id === a.actorId)?.name ?? '',
      })),
      interactions: project.interactions.map((i) => {
        const from = project.activities.find((a) => a.id === i.fromActivityId)
        const to = project.activities.find((a) => a.id === i.toActivityId)
        return {
          fromActivityName: from?.name ?? '',
          fromActorName: project.actors.find((x) => x.id === from?.actorId)?.name ?? '',
          toActivityName: to?.name ?? '',
          toActorName: project.actors.find((x) => x.id === to?.actorId)?.name ?? '',
          information: i.information,
          condition: i.condition,
        }
      }),
    }
  }

  function fetchSolutions() {
    setStatus('loading')
    setError(null)
    api
      .generatePainPointSolutions(buildContext())
      .then((result) => {
        setSolutions(result)
        setStatus('ready')
      })
      .catch((e) => {
        switch (classifyGenerationError(e)) {
          case 'not-configured':
            setStatus('not-configured')
            break
          case 'rate-limited':
            setStatus('rate-limited')
            break
          default:
            setError(String(e))
            setStatus('ready')
        }
      })
  }

  // Chargement au montage uniquement (une solution choisie ne redéclenche
  // pas une nouvelle liste de propositions) — tableau de dépendances
  // volontairement vide.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fetchSolutions, [])

  async function chooseSolution(solution: DraftPainPointSolution) {
    setStatus('resolving')
    setError(null)
    try {
      const resolution = await api.generatePainPointResolution(buildContext(), solution)
      const { project: updated, diagramChangeApplied } = applyPainPointResolution(
        project,
        activity.id,
        painPoint.id,
        resolution,
        solution.changeType,
        isTargetActive,
      )
      onChange(updated)
      setAddedCodes({
        spec: updated.specifications[updated.specifications.length - 1].code,
        test: updated.testScenarios[updated.testScenarios.length - 1].code,
      })
      setDiagramChangeApplied(diagramChangeApplied)
      setChosenDescription(solution.description)
      setStatus('done')
    } catch (e) {
      if (classifyGenerationError(e) === 'rate-limited') {
        setError("Le fournisseur LLM limite temporairement le nombre d'appels (429) — réessayez dans quelques instants.")
      } else {
        setError(String(e))
      }
      setStatus('ready')
    }
  }

  return (
    // Imbriquée dans le fond de ActivityDetailModal.tsx (voir ce fichier) :
    // stopPropagation sur le clic de CE fond, sans quoi il remonterait au
    // fond de la modale parente et refermerait les deux d'un coup au lieu
    // d'une seule.
    <div
      className="modal-backdrop"
      onClick={(e) => {
        e.stopPropagation()
        onClose()
      }}
    >
      <div className="modal painpoint-solutions-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Solutions pour ce point de friction</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>
        <p className="nl-hint">« {painPoint.text} »</p>

        {status === 'not-configured' && (
          <div className="nl-warning">
            Génération indisponible : aucune clé API n'est configurée. Ouvrez <strong>Paramètres</strong> en bas de
            la barre latérale pour en saisir une.
          </div>
        )}
        {status === 'rate-limited' && (
          <div className="nl-warning">
            Le fournisseur LLM limite temporairement le nombre d'appels (429) — réessayez dans quelques instants, ou
            changez de fournisseur depuis <strong>Paramètres</strong> si cela persiste.
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {status === 'loading' && (
          <p className="loading-row">
            <Spinner /> Génération de 5 solutions…
          </p>
        )}
        {status === 'ready' && solutions.length === 0 && !error && (
          <p className="actor-warning">Aucune solution proposée.</p>
        )}

        {(status === 'ready' || status === 'resolving') && solutions.length > 0 && (
          <ul className="painpoint-solutions-list">
            {solutions.map((s, i) => (
              <li key={i} className="painpoint-solution-card">
                <span className={`painpoint-solution-type painpoint-solution-type-${s.changeType}`}>
                  {CHANGE_TYPE_LABELS[s.changeType] ?? s.changeType}
                </span>
                <p>{s.description}</p>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => chooseSolution(s)}
                  disabled={status === 'resolving'}
                >
                  Choisir cette solution
                </button>
              </li>
            ))}
          </ul>
        )}

        {status === 'resolving' && (
          <p className="loading-row">
            <Spinner /> Génération de la spécification et du test…
          </p>
        )}

        {status === 'done' && addedCodes && (
          <div className="painpoint-solution-done">
            <p className="saved-at">
              Ajoutés au projet : <strong>{addedCodes.spec}</strong> et <strong>{addedCodes.test}</strong>.
            </p>
            {diagramChangeApplied ? (
              <p className="saved-at">Le changement structurel a été intégré au diagramme cible.</p>
            ) : (
              <p className="nl-warning">
                Le changement structurel n'a pas pu être identifié automatiquement dans le diagramme cible — à
                appliquer manuellement si besoin : « {chosenDescription} »
              </p>
            )}
            <button type="button" className="btn-primary" onClick={onClose}>
              Fermer
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
