import { GitCompareArrows, Trash2 } from 'lucide-react'
import type { Project } from '../../api/types'
import type { ActiveVariant } from './activeVariant'

interface Props {
  project: Project
  active: ActiveVariant
  onSwitch: (variant: ActiveVariant) => void
  onCreateTarget: () => void
  onDeleteTarget: () => void
  onCompare: () => void
  creating: boolean
}

// Sélecteur Actuel/Cible d'une mission — remplace l'ancien VariantSwitcher
// (variantes = projets séparés liés par un groupe) : la cible reste
// désormais partie de la MÊME mission (Project.target), donc plus besoin
// de choisir parmi des projets frères — seulement deux états fixes de
// cette mission. Bouton radio (rôle ARIA "radio" + aria-checked) avec
// indicateur visuel net (couleur/point plein pour l'état affiché) plutôt
// qu'un simple onglet, pour qu'on distingue immédiatement quelle version
// est à l'écran — demandé explicitement par l'utilisateur, une confusion
// actuel/cible pouvant faire éditer par erreur la mauvaise version.
export function VariantToggle({ project, active, onSwitch, onCreateTarget, onDeleteTarget, onCompare, creating }: Props) {
  const hasTarget = Boolean(project.target)

  return (
    <div className="variant-toggle" role="radiogroup" aria-label="Version du diagramme affichée">
      <button
        type="button"
        role="radio"
        aria-checked={active === 'current'}
        className={`variant-toggle-option variant-toggle-current${active === 'current' ? ' active' : ''}`}
        onClick={() => onSwitch('current')}
      >
        <span className="variant-toggle-dot" aria-hidden="true" />
        Actuel
      </button>
      {hasTarget ? (
        <button
          type="button"
          role="radio"
          aria-checked={active === 'target'}
          className={`variant-toggle-option variant-toggle-target${active === 'target' ? ' active' : ''}`}
          onClick={() => onSwitch('target')}
        >
          <span className="variant-toggle-dot" aria-hidden="true" />
          {project.target?.label || 'Cible'}
        </button>
      ) : (
        <button type="button" className="variant-toggle-create" onClick={onCreateTarget} disabled={creating}>
          {creating ? 'Création…' : '+ Créer la cible'}
        </button>
      )}
      {hasTarget && (
        <button type="button" className="variant-compare" onClick={onCompare} title="Comparer Actuel et Cible côte à côte">
          <GitCompareArrows size={14} aria-hidden="true" /> Comparer
        </button>
      )}
      {hasTarget && (
        <button
          type="button"
          className="variant-delete-target"
          onClick={onDeleteTarget}
          title="Supprimer la cible (l'état Actuel n'est pas affecté)"
          aria-label="Supprimer la cible"
        >
          <Trash2 size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}
