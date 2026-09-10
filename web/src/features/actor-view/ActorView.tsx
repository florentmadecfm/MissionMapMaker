import { useState } from 'react'
import type { Project } from '../../api/types'
import { ActorDetail } from './ActorDetail'

interface Props {
  project: Project
  // Acteur à présélectionner à l'ouverture — utilisé quand on arrive sur
  // cet onglet depuis "Ouvrir cette mission" de l'écran transverse Acteurs
  // (ActorMissionsScreen.tsx), pour continuer sur le même acteur plutôt
  // que de retomber sur le premier de la liste.
  initialActorId?: string
}

export function ActorView({ project, initialActorId }: Props) {
  const [actorId, setActorId] = useState<string | null>(initialActorId ?? project.actors[0]?.id ?? null)

  if (project.actors.length === 0) {
    return <p className="placeholder">Ajoutez au moins un acteur pour voir cette vue.</p>
  }

  const actor = project.actors.find((a) => a.id === actorId) ?? project.actors[0]

  return (
    <div className="actor-view">
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
      </nav>

      <ActorDetail project={project} actorId={actor.id} />
    </div>
  )
}
