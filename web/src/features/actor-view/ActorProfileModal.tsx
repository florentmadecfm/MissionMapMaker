import { useState } from 'react'
import { api } from '../../api/client'
import type { ActorGoal, ActorPainPoint, Project } from '../../api/types'
import { ActorDetail } from './ActorDetail'

interface Props {
  project: Project
  actorId: string
  onChange: (project: Project) => void
  onClose: () => void
  // Sauvegarde optionnelle intégrée à la modale, pour un écran appelant qui
  // n'a pas de sauvegarde automatique propre (l'écran transverse Acteurs
  // de ActorMissionsScreen.tsx, qui n'édite rien d'autre que cette fiche
  // et vit hors de l'état `project` de ProjectShell) — ProcessDiagram/
  // ActorView, ouverts DEPUIS un projet chargé dans ProjectShell, ne
  // passent pas ces props : un changement y remonte par onChange comme
  // n'importe quel autre, capté par la sauvegarde automatique du shell
  // (voir ProjectShell.tsx, runSave).
  onSave?: () => void
  saving?: boolean
  saveError?: string | null
  savedAt?: string | null
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Fiche persona d'un acteur (ADR-055) : À propos/Bio en texte libre,
// Objectifs et Points de friction du métier en listes éditables (comme
// ActivityDetailModal.tsx pour les points de friction d'une activité,
// ADR-052), et un rappel en lecture seule de son implication dans le
// processus (réutilise ActorDetail.tsx, déjà utilisé par l'onglet Vue par
// acteur et l'écran transverse Acteurs). Un changement remonte par
// onChange comme le reste de l'app — persisté automatiquement (voir
// ProjectShell.tsx) sauf depuis l'écran transverse Acteurs, seul appelant
// qui passe onSave (voir ce champ ci-dessus).
export function ActorProfileModal({ project, actorId, onChange, onClose, onSave, saving, saveError, savedAt }: Props) {
  const [newGoal, setNewGoal] = useState('')
  const [newPainPoint, setNewPainPoint] = useState('')
  const [portraitLoading, setPortraitLoading] = useState(false)
  const [portraitError, setPortraitError] = useState<string | null>(null)
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

  // Génération d'image (ADR-073) : portrait/sketch IA de ce persona à
  // partir de sa fiche déjà remplie — jamais de génération automatique,
  // toujours un geste explicite de l'utilisateur (comme le reste de la
  // génération assistée dans l'app).
  async function generatePortrait() {
    if (!actor) return
    setPortraitLoading(true)
    setPortraitError(null)
    try {
      const { imageDataUrl } = await api.generatePersonaPortrait({
        name: actor.name,
        about: actor.about,
        bio: actor.bio,
        goals: actor.goals.map((g) => g.text),
        painPoints: actor.painPoints.map((p) => p.text),
      })
      updateActor({ portraitImage: imageDataUrl })
    } catch (e) {
      setPortraitError(String(e))
    } finally {
      setPortraitLoading(false)
    }
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

        <div className="actor-portrait">
          {actor.portraitImage && (
            <img className="actor-portrait-image" src={actor.portraitImage} alt={`Portrait généré de ${actor.name}`} />
          )}
          <div className="actor-portrait-actions">
            <button type="button" onClick={generatePortrait} disabled={portraitLoading}>
              {portraitLoading ? 'Génération…' : actor.portraitImage ? 'Régénérer le portrait' : 'Générer un portrait'}
            </button>
            {portraitError && <span className="error">{portraitError}</span>}
          </div>
        </div>

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
          rows={6}
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

        {onSave && (
          <footer className="modal-footer">
            <button type="button" className="btn-primary" onClick={onSave} disabled={saving}>
              {saving ? 'Sauvegarde…' : 'Sauvegarder'}
            </button>
            {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
            {saveError && <span className="error">{saveError}</span>}
          </footer>
        )}
      </div>
    </div>
  )
}
