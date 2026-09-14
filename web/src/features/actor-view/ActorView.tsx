import { useState } from 'react'
import type { Project } from '../../api/types'
import { ActorDetail } from './ActorDetail'
import { ActorProfileModal } from './ActorProfileModal'

interface Props {
  project: Project
  onChange: (project: Project) => void
  // Acteur à présélectionner à l'ouverture — utilisé quand on arrive sur
  // cet onglet depuis "Ouvrir cette mission" de l'écran transverse Acteurs
  // (ActorMissionsScreen.tsx), pour continuer sur le même acteur plutôt
  // que de retomber sur le premier de la liste.
  initialActorId?: string
}

// Sauvegarde automatique (ProjectShell.tsx) : cet onglet ne persiste plus
// lui-même, il se contente de remonter chaque changement via onChange.
export function ActorView({ project, onChange, initialActorId }: Props) {
  const [actorId, setActorId] = useState<string | null>(initialActorId ?? project.actors[0]?.id ?? null)
  const [profileOpen, setProfileOpen] = useState(false)

  if (project.actors.length === 0) {
    return <p className="placeholder">Ajoutez au moins un persona pour voir cette vue.</p>
  }

  const actor = project.actors.find((a) => a.id === actorId) ?? project.actors[0]

  return (
    <div className="actor-view">
      <header className="editor-header">
        <p className="nl-hint" style={{ flex: 1 }}>
          Cliquez sur "Voir la fiche" pour consulter et compléter la fiche du persona sélectionné (à propos,
          bio, objectifs, points de friction du métier).
        </p>
      </header>

      <nav className="actor-chips">
        {project.actors.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`actor-chip${a.id === actor.id ? ' active' : ''}`}
            style={{ borderColor: a.color }}
            onClick={() => setActorId(a.id)}
          >
            <span className="actor-dot" style={{ background: a.color }} />
            {a.name}
          </button>
        ))}
        <button type="button" className="actor-profile-button" onClick={() => setProfileOpen(true)}>
          Voir la fiche
        </button>
      </nav>

      <ActorDetail project={project} actorId={actor.id} />

      {profileOpen && (
        <ActorProfileModal
          project={project}
          actorId={actor.id}
          onChange={onChange}
          onClose={() => setProfileOpen(false)}
        />
      )}
    </div>
  )
}
