import { useState } from 'react'
import { ClipboardCheck, GitCompareArrows, Map, Sparkles, Users, Workflow } from 'lucide-react'

interface Props {
  onClose: () => void
}

const STEPS = [
  {
    icon: Map,
    title: 'Bienvenue dans MissionMapMaker',
    body: "Cartographiez un processus métier — personas, étapes, échanges — avec traçabilité vers vos exigences et vos tests. Ce petit tour vous montre l'essentiel en une minute, skippable à tout moment.",
  },
  {
    icon: Sparkles,
    title: 'Décrivez, l’IA cartographie',
    body: 'Dans l’onglet « Générer », décrivez votre mission en langage naturel : personas, phases, activités et interactions sont proposés automatiquement, prêts à ajuster.',
  },
  {
    icon: Workflow,
    title: 'Un diagramme qui se manipule',
    body: 'Glissez-déposez les activités entre personas et phases, reliez-les pour créer des interactions, annulez/rétablissez (Ctrl+Z), exportez en PNG ou générez un sketch illustré.',
  },
  {
    icon: Users,
    title: 'Personas partagés & points de friction',
    body: 'Chaque persona (à propos, bio, objectifs) est partagé par nom entre toutes vos missions. Un point de friction relevé peut être résolu en un clic : spécification et scénario de test générés automatiquement.',
  },
  {
    icon: GitCompareArrows,
    title: 'Comparez Actuel et Cible',
    body: 'Créez une version « Cible » de votre mission et comparez-la côte à côte avec l’état « Actuel » pour visualiser précisément ce qui change.',
  },
  {
    icon: ClipboardCheck,
    title: 'Tracez, exportez, personnalisez',
    body: 'Les spécifications se relient à vos activités pour une traçabilité complète. Exportez en Excel ou PNG, et personnalisez les prompts de génération depuis Paramètres.',
  },
]

// Visite guidée à la première utilisation (ADR-078) : une suite d'écrans
// autonomes plutôt qu'un vrai "spotlight" pointant les éléments réels de
// l'interface — plus simple et bien plus robuste (aucune dépendance à la
// position d'un élément DOM, au projet ouvert, à l'onglet actif ou à la
// taille de la fenêtre, qu'un vrai spotlight devrait sans cesse
// recalculer). Se ferme et se relance comme n'importe quelle modale de
// l'app (.modal-backdrop/.modal) ; ProjectShell.tsx décide QUAND
// l'afficher (première visite, ou rappel manuel depuis Paramètres) et
// mémorise qu'elle a été vue.
export function WelcomeTour({ onClose }: Props) {
  const [step, setStep] = useState(0)
  const isFirst = step === 0
  const isLast = step === STEPS.length - 1
  const current = STEPS[step]
  const Icon = current.icon

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal welcome-tour" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="welcome-tour-skip" onClick={onClose}>
          Passer
        </button>

        <div className="welcome-tour-icon">
          <Icon size={32} aria-hidden="true" />
        </div>
        <h2>{current.title}</h2>
        <p>{current.body}</p>

        <div className="welcome-tour-dots" aria-hidden="true">
          {STEPS.map((s, i) => (
            <span key={s.title} className={i === step ? 'active' : ''} />
          ))}
        </div>

        <div className="welcome-tour-actions">
          <button type="button" onClick={() => setStep((s) => s - 1)} disabled={isFirst}>
            Précédent
          </button>
          <span className="welcome-tour-progress">
            {step + 1} / {STEPS.length}
          </span>
          <button
            type="button"
            className="btn-primary"
            onClick={() => (isLast ? onClose() : setStep((s) => s + 1))}
          >
            {isLast ? 'Terminer' : 'Suivant'}
          </button>
        </div>
      </div>
    </div>
  )
}
