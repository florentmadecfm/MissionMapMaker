import { useCallback, useRef, useState } from 'react'
import type { Project } from '../../api/types'
import { ReadOnlyProcessDiagram } from '../process-diagram/ReadOnlyProcessDiagram'
import { toWorkingProject } from './activeVariant'

interface Props {
  project: Project
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

const MIN_PANEL_PERCENT = 20
const MAX_PANEL_PERCENT = 80
const DEFAULT_LEFT_PERCENT = 50

// Vue de comparaison côte à côte entre Actuel et Cible d'UNE MÊME mission
// (avant : comparaison entre deux projets frères liés par un groupe de
// variantes — obsolète depuis que la cible vit dans le projet lui-même,
// voir activeVariant.ts). Deux panneaux fixes (plus de sélection : il n'y
// a plus que ces deux états possibles) séparés par un diviseur glissable
// qui agrandit l'un en rétrécissant l'autre (largeurs en %, bornées pour
// qu'aucun panneau ne disparaisse complètement).
export function VariantComparisonScreen({ project, onClose }: Props) {
  const [leftPercent, setLeftPercent] = useState(DEFAULT_LEFT_PERCENT)
  const containerRef = useRef<HTMLDivElement>(null)
  const dragging = useRef(false)

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!dragging.current || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const percent = ((e.clientX - rect.left) / rect.width) * 100
    setLeftPercent(Math.min(MAX_PANEL_PERCENT, Math.max(MIN_PANEL_PERCENT, percent)))
  }, [])

  const stopDragging = useCallback(() => {
    dragging.current = false
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', stopDragging)
  }, [handlePointerMove])

  function startDragging(e: React.PointerEvent) {
    e.preventDefault()
    dragging.current = true
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopDragging)
  }

  if (!project.target) {
    return (
      <div className="variant-comparison-screen">
        <header className="editor-header">
          <h2 className="panel-title">Comparer Actuel et Cible</h2>
          <button type="button" onClick={onClose}>
            Fermer la comparaison
          </button>
        </header>
        <p className="placeholder">
          Cette mission n'a pas encore de cible — créez-la d'abord (bouton « + Créer la cible » au-dessus des onglets)
          pour pouvoir comparer.
        </p>
      </div>
    )
  }

  const current = project
  const target = toWorkingProject(project, 'target')

  return (
    <div className="variant-comparison-screen">
      <header className="editor-header">
        <h2 className="panel-title">Comparer Actuel et Cible</h2>
        <button type="button" onClick={onClose}>
          Fermer la comparaison
        </button>
      </header>
      <div className="variant-comparison-panels" ref={containerRef}>
        <VariantPanel label="Actuel" project={current} widthPercent={leftPercent} />
        <div
          className="variant-comparison-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner les panneaux de comparaison"
          onPointerDown={startDragging}
        />
        <VariantPanel label={project.target.label || 'Cible'} project={target} widthPercent={100 - leftPercent} />
      </div>
    </div>
  )
}

interface PanelProps {
  label: string
  project: Project
  widthPercent: number
}

function VariantPanel({ label, project, widthPercent }: PanelProps) {
  const stats = summarize(project)
  return (
    <section className="variant-comparison-panel" style={{ flexBasis: `${widthPercent}%` }}>
      <h3 className="variant-comparison-panel-title">{label}</h3>
      <p className="variant-comparison-stats">
        {stats.actors} persona{stats.actors > 1 ? 's' : ''} · {stats.phases} phase{stats.phases > 1 ? 's' : ''} ·{' '}
        {stats.activities} activité{stats.activities > 1 ? 's' : ''} · {stats.painPoints} point
        {stats.painPoints > 1 ? 's' : ''} de friction
      </p>
      <div className="variant-comparison-diagram">
        <ReadOnlyProcessDiagram project={project} />
      </div>
    </section>
  )
}
