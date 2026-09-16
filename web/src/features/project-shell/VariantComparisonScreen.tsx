import { useCallback, useRef, useState } from 'react'
import type { Project } from '../../api/types'
import { ProcessDiagram } from '../process-diagram/ProcessDiagram'
import { fromWorkingProject, toWorkingProject } from './activeVariant'

interface Props {
  project: Project
  onChange: (project: Project) => void
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
// qu'aucun panneau ne disparaisse complètement). Chaque panneau embarque
// le diagramme ÉDITABLE complet (ProcessDiagram, pas ReadOnlyProcessDiagram) :
// glisser-déposer, mise à jour en langage naturel, export PNG..., exactement
// comme l'onglet Diagramme — modifier l'un des deux panneaux ne touche
// jamais l'autre (fromWorkingProject route chaque changement vers la bonne
// moitié du projet réel), pratique pour ajuster les deux versions sans
// repasser par le sélecteur Actuel/Cible de l'onglet Diagramme.
export function VariantComparisonScreen({ project, onChange, onClose }: Props) {
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

  function handleCurrentChange(updated: Project) {
    onChange(fromWorkingProject(project, updated, 'current'))
  }
  function handleTargetChange(updated: Project) {
    onChange(fromWorkingProject(project, updated, 'target'))
  }

  return (
    <div className="variant-comparison-screen">
      <header className="editor-header">
        <h2 className="panel-title">Comparer Actuel et Cible</h2>
        <button type="button" onClick={onClose}>
          Fermer la comparaison
        </button>
      </header>
      <div className="variant-comparison-panels" ref={containerRef}>
        <VariantPanel
          label="Actuel"
          project={current}
          onChange={handleCurrentChange}
          isTargetActive={false}
          rootProject={project}
          widthPercent={leftPercent}
        />
        <div
          className="variant-comparison-divider"
          role="separator"
          aria-orientation="vertical"
          aria-label="Redimensionner les panneaux de comparaison"
          onPointerDown={startDragging}
        />
        <VariantPanel
          label={project.target.label || 'Cible'}
          project={target}
          onChange={handleTargetChange}
          isTargetActive
          rootProject={project}
          widthPercent={100 - leftPercent}
        />
      </div>
    </div>
  )
}

interface PanelProps {
  label: string
  project: Project
  onChange: (project: Project) => void
  isTargetActive: boolean
  // Le vrai projet (Actuel + Cible), pour que l'export PNG de ce panneau
  // puisse proposer "Les deux" comme depuis l'onglet Diagramme — voir
  // ProcessDiagram.tsx, Props.rootProject.
  rootProject: Project
  widthPercent: number
}

function VariantPanel({ label, project, onChange, isTargetActive, rootProject, widthPercent }: PanelProps) {
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
        <ProcessDiagram
          key={isTargetActive ? 'target' : 'current'}
          project={project}
          onChange={onChange}
          isTargetActive={isTargetActive}
          rootProject={rootProject}
        />
      </div>
    </section>
  )
}
