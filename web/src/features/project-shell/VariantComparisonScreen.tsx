import { useEffect, useMemo, useState } from 'react'
import { api } from '../../api/client'
import type { Project, ProjectSummary } from '../../api/types'
import { ReadOnlyProcessDiagram } from '../process-diagram/ReadOnlyProcessDiagram'

interface Props {
  project: Project
  summaries: ProjectSummary[]
  onClose: () => void
}

function summarize(p: Project) {
  return {
    actors: p.actors.length,
    phases: p.phases.length,
    activities: p.activities.length,
    painPoints: p.activities.reduce((n, a) => n + a.painPoints.length, 0),
  }
}

// Vue de comparaison côte à côte entre variantes d'une même mission
// (ADR-063) — construction différée depuis ADR-062, qui manquait d'un
// mode de rendu en lecture seule du diagramme (voir ReadOnlyProcessDiagram).
// Deux panneaux indépendants, chacun avec son propre groupe de boutons
// radio pour choisir quelle variante y afficher (par défaut les deux
// premières du groupe, triées comme VariantSwitcher) — permet par exemple
// de comparer deux cibles entre elles aussi bien que l'état actuel à une
// cible.
export function VariantComparisonScreen({ project, summaries, onClose }: Props) {
  const siblings = useMemo(
    () =>
      [...summaries]
        .filter((s) => s.variantGroupId === project.variantGroupId)
        .sort((a, b) => (a.variantLabel ?? a.name).localeCompare(b.variantLabel ?? b.name)),
    [summaries, project.variantGroupId],
  )

  const [leftId, setLeftId] = useState(siblings[0]?.id ?? '')
  const [rightId, setRightId] = useState(siblings[1]?.id ?? siblings[0]?.id ?? '')
  // Amorcé avec le projet déjà ouvert (évite un aller-retour réseau pour
  // celui-là si l'une des deux colonnes le sélectionne) ; les autres sont
  // récupérés à la demande ci-dessous.
  const [projectsById, setProjectsById] = useState<Record<string, Project>>({ [project.id]: project })
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const wanted = [...new Set([leftId, rightId])].filter((id) => id && !projectsById[id])
    if (wanted.length === 0) return
    setLoadingIds((prev) => new Set([...prev, ...wanted]))
    setError(null)
    Promise.all(wanted.map((id) => api.getProject(id)))
      .then((loaded) => {
        setProjectsById((prev) => ({ ...prev, ...Object.fromEntries(loaded.map((p) => [p.id, p])) }))
      })
      .catch((e) => setError(String(e)))
      .finally(() => {
        setLoadingIds((prev) => {
          const next = new Set(prev)
          for (const id of wanted) next.delete(id)
          return next
        })
      })
  }, [leftId, rightId, projectsById])

  return (
    <div className="variant-comparison-screen">
      <header className="editor-header">
        <h2 className="panel-title">Comparer les variantes</h2>
        <button type="button" onClick={onClose}>
          Fermer la comparaison
        </button>
      </header>
      {error && <p className="error">{error}</p>}
      {siblings.length < 2 ? (
        <p className="placeholder">Il faut au moins deux variantes dans ce groupe pour les comparer.</p>
      ) : (
        <div className="variant-comparison-panels">
          <VariantPanel
            label="Panneau de gauche"
            siblings={siblings}
            selectedId={leftId}
            onSelect={setLeftId}
            project={projectsById[leftId]}
            loading={loadingIds.has(leftId)}
          />
          <VariantPanel
            label="Panneau de droite"
            siblings={siblings}
            selectedId={rightId}
            onSelect={setRightId}
            project={projectsById[rightId]}
            loading={loadingIds.has(rightId)}
          />
        </div>
      )}
    </div>
  )
}

interface PanelProps {
  label: string
  siblings: ProjectSummary[]
  selectedId: string
  onSelect: (id: string) => void
  project: Project | undefined
  loading: boolean
}

function VariantPanel({ label, siblings, selectedId, onSelect, project, loading }: PanelProps) {
  const groupName = `variant-comparison-${label.replace(/\s+/g, '-')}`
  const stats = project ? summarize(project) : null
  return (
    <section className="variant-comparison-panel">
      <fieldset className="variant-comparison-radios">
        <legend>{label}</legend>
        {siblings.map((s) => (
          <label key={s.id} className="variant-comparison-radio">
            <input
              type="radio"
              name={groupName}
              value={s.id}
              checked={selectedId === s.id}
              onChange={() => onSelect(s.id)}
            />
            {s.variantLabel || s.name}
          </label>
        ))}
      </fieldset>
      {stats && (
        <p className="variant-comparison-stats">
          {stats.actors} acteur{stats.actors > 1 ? 's' : ''} · {stats.phases} phase{stats.phases > 1 ? 's' : ''} ·{' '}
          {stats.activities} activité{stats.activities > 1 ? 's' : ''} · {stats.painPoints} point
          {stats.painPoints > 1 ? 's' : ''} de friction
        </p>
      )}
      <div className="variant-comparison-diagram">
        {loading && <p className="placeholder">Chargement…</p>}
        {!loading && project && <ReadOnlyProcessDiagram project={project} />}
      </div>
    </section>
  )
}
