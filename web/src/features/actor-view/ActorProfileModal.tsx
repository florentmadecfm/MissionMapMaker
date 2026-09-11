import { useState } from 'react'
import type { ActorGoal, ActorPainPoint, Project } from '../../api/types'
import { ActorDetail } from './ActorDetail'

interface Props {
  project: Project
  actorId: string
  onChange: (project: Project) => void
  onClose: () => void
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Fiche persona d'un acteur (ADR-055) : À propos/Bio en texte libre,
// Objectifs et Points de friction du métier en listes éditables (comme
// ActivityDetailModal.tsx pour les points de friction d'une activité,
// ADR-052), et un rappel en lecture seule de son implication dans le
// processus (réutilise ActorDetail.tsx, déjà utilisé par l'onglet Vue par
// acteur et l'écran transverse Acteurs). Comme le reste de l'app, un
// changement d'état local — « Sauvegarder » reste nécessaire pour le
// persister.
export function ActorProfileModal({ project, actorId, onChange, onClose }: Props) {
  const [newGoal, setNewGoal] = useState('')
  const [newPainPoint, setNewPainPoint] = useState('')
  const actor = project.actors.find((a) => a.id === actorId)
  if (!actor) return null

  function updateActor(patch: Partial<typeof actor>) {
    if (!actor) return
    onChange({
      ...project,
      actors: project.actors.map((a) => (a.id === actor.id ? { ...a, ...patch } : a)),
    })
  }

  function addGoal() {
    const text = newGoal.trim()
    if (!text || !actor) return
    const goal: ActorGoal = { id: newId('goal'), text }
    updateActor({ goals: [...actor.goals, goal] })
    setNewGoal('')
  }

  function removeGoal(id: string) {
    if (!actor) return
    updateActor({ goals: actor.goals.filter((g) => g.id !== id) })
  }

  function addPainPoint() {
    const text = newPainPoint.trim()
    if (!text || !actor) return
    const painPoint: ActorPainPoint = { id: newId('app'), text }
    updateActor({ painPoints: [...actor.painPoints, painPoint] })
    setNewPainPoint('')
  }

  function removePainPoint(id: string) {
    if (!actor) return
    updateActor({ painPoints: actor.painPoints.filter((p) => p.id !== id) })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal actor-profile-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            <span className="actor-dot" style={{ background: actor.color }} /> {actor.name}
          </h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <label className="field-label" htmlFor="actor-about">
          À propos
        </label>
        <input
          id="actor-about"
          value={actor.about}
          onChange={(e) => updateActor({ about: e.target.value })}
          placeholder="Ex. gère l'accueil et le service en salle"
        />

        <label className="field-label" htmlFor="actor-bio">
          Bio
        </label>
        <textarea
          id="actor-bio"
          rows={3}
          value={actor.bio}
          onChange={(e) => updateActor({ bio: e.target.value })}
          placeholder="Parcours, contexte, ce qui caractérise cette personne dans son rôle…"
        />

        <h3>Objectifs</h3>
        {actor.goals.length === 0 ? (
          <p className="actor-warning">Aucun objectif pour l'instant.</p>
        ) : (
          <ul className="item-list">
            {actor.goals.map((g) => (
              <li key={g.id}>
                <span>{g.text}</span>
                <button type="button" className="danger" onClick={() => removeGoal(g.id)}>
                  supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="item-add">
          <input
            value={newGoal}
            onChange={(e) => setNewGoal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addGoal()}
            placeholder="Ex. servir un maximum de clients satisfaits par service"
          />
          <button type="button" onClick={addGoal} disabled={!newGoal.trim()}>
            Ajouter
          </button>
        </div>

        <h3>Points de friction du métier</h3>
        {actor.painPoints.length === 0 ? (
          <p className="actor-warning">Aucun point de friction pour l'instant.</p>
        ) : (
          <ul className="item-list item-list-warning">
            {actor.painPoints.map((p) => (
              <li key={p.id}>
                <span>{p.text}</span>
                <button type="button" className="danger" onClick={() => removePainPoint(p.id)}>
                  supprimer
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="item-add">
          <input
            value={newPainPoint}
            onChange={(e) => setNewPainPoint(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addPainPoint()}
            placeholder="Ex. doit gérer plusieurs tables en simultané aux heures de pointe"
          />
          <button type="button" onClick={addPainPoint} disabled={!newPainPoint.trim()}>
            Ajouter
          </button>
        </div>

        <h3>Activités du processus</h3>
        <ActorDetail project={project} actorId={actor.id} />
      </div>
    </div>
  )
}
