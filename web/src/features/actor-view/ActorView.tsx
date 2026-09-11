import { useState } from 'react'
import { api } from '../../api/client'
import type { Project } from '../../api/types'
import { ActorDetail } from './ActorDetail'
import { ActorProfileModal } from './ActorProfileModal'

interface Props {
  project: Project
  onChange: (project: Project) => void
  onSaved: () => void
  // Acteur à présélectionner à l'ouverture — utilisé quand on arrive sur
  // cet onglet depuis "Ouvrir cette mission" de l'écran transverse Acteurs
  // (ActorMissionsScreen.tsx), pour continuer sur le même acteur plutôt
  // que de retomber sur le premier de la liste.
  initialActorId?: string
}

export function ActorView({ project, onChange, onSaved, initialActorId }: Props) {
  const [actorId, setActorId] = useState<string | null>(initialActorId ?? project.actors[0]?.id ?? null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await api.saveProject(project)
      onChange(saved)
      onSaved()
      setSavedAt(new Date().toLocaleTimeString())
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  if (project.actors.length === 0) {
    return <p className="placeholder">Ajoutez au moins un acteur pour voir cette vue.</p>
  }

  const actor = project.actors.find((a) => a.id === actorId) ?? project.actors[0]

  return (
    <div className="actor-view">
      <header className="editor-header">
        <p className="nl-hint" style={{ flex: 1 }}>
          Cliquez sur "Voir la fiche" pour consulter et compléter la fiche persona de l'acteur sélectionné (à propos,
          bio, objectifs, points de friction du métier).
        </p>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
        {saveError && <span className="error">{saveError}</span>}
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
