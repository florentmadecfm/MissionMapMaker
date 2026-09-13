import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { api } from '../../api/client'
import type { Activity, Actor, Interaction, Phase, Project } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

interface Props {
  project: Project
  onChange: (project: Project) => void
  onSaved: () => void
}

export function ProjectEditor({ project, onChange, onSaved }: Props) {
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

  function addActor() {
    const actor: Actor = {
      id: newId('act'),
      name: 'Nouvel acteur',
      color: '#2563eb',
      description: '',
      subLanes: 0,
      backstage: false,
      about: '',
      bio: '',
      goals: [],
      painPoints: [],
    }
    onChange({ ...project, actors: [...project.actors, actor] })
  }

  function updateActor(id: string, patch: Partial<Actor>) {
    onChange({
      ...project,
      actors: project.actors.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })
  }

  function removeActor(id: string) {
    onChange({
      ...project,
      actors: project.actors.filter((a) => a.id !== id),
      activities: project.activities.filter((act) => act.actorId !== id),
    })
  }

  function addPhase() {
    const phase: Phase = {
      id: newId('ph'),
      name: 'Nouvelle phase',
      order: project.phases.length + 1,
      subColumns: 0,
      icon: '',
      duration: '',
      satisfactionScore: 0,
    }
    onChange({ ...project, phases: [...project.phases, phase] })
  }

  function updatePhase(id: string, patch: Partial<Phase>) {
    onChange({
      ...project,
      phases: project.phases.map((p) => (p.id === id ? { ...p, ...patch } : p)),
    })
  }

  function removePhase(id: string) {
    onChange({
      ...project,
      phases: project.phases.filter((p) => p.id !== id),
      activities: project.activities.filter((act) => act.phaseId !== id),
    })
  }

  // Réordonnancement du backbone (méthode d'extraction du processus,
  // ADR-027 : acteurs → phases CHRONOLOGIQUES → activités → interactions) —
  // jusqu'ici l'ordre des phases n'était fixé qu'à la création (dernière
  // position) et jamais modifiable après coup, seul moyen de corriger une
  // phase mal placée était de tout supprimer et recréer dans le bon ordre.
  // Échange l'`order` de la phase avec celui de sa voisine immédiate (dans
  // l'ordre actuellement affiché) plutôt qu'une renumérotation complète :
  // reste correct même avec des `order` non contigus (ex. après suppression
  // d'une phase).
  function movePhase(id: string, direction: -1 | 1) {
    const sorted = [...project.phases].sort((a, b) => a.order - b.order)
    const index = sorted.findIndex((p) => p.id === id)
    const swapIndex = index + direction
    if (index === -1 || swapIndex < 0 || swapIndex >= sorted.length) return
    const current = sorted[index]
    const swapWith = sorted[swapIndex]
    onChange({
      ...project,
      phases: project.phases.map((p) => {
        if (p.id === current.id) return { ...p, order: swapWith.order }
        if (p.id === swapWith.id) return { ...p, order: current.order }
        return p
      }),
    })
  }

  function addActivity() {
    if (project.actors.length === 0 || project.phases.length === 0) return
    const activity: Activity = {
      id: newId('a'),
      name: 'Nouvelle activité',
      actorId: project.actors[0].id,
      phaseId: project.phases[0].id,
      order: project.activities.length + 1,
      column: 0,
      subRow: 0,
      offsetX: 0,
      offsetY: 0,
      description: '',
      userStories: [],
      traceLinks: [],
      painPoints: [],
    }
    onChange({ ...project, activities: [...project.activities, activity] })
  }

  function updateActivity(id: string, patch: Partial<Activity>) {
    onChange({
      ...project,
      activities: project.activities.map((a) => (a.id === id ? { ...a, ...patch } : a)),
    })
  }

  function removeActivity(id: string) {
    onChange({
      ...project,
      activities: project.activities.filter((a) => a.id !== id),
      interactions: project.interactions.filter(
        (i) => i.fromActivityId !== id && i.toActivityId !== id,
      ),
    })
  }

  function addInteraction() {
    if (project.activities.length < 2) return
    const interaction: Interaction = {
      id: newId('int'),
      fromActivityId: project.activities[0].id,
      toActivityId: project.activities[1].id,
      information: 'Information échangée',
    }
    onChange({ ...project, interactions: [...project.interactions, interaction] })
  }

  function updateInteraction(id: string, patch: Partial<Interaction>) {
    onChange({
      ...project,
      interactions: project.interactions.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })
  }

  function removeInteraction(id: string) {
    onChange({ ...project, interactions: project.interactions.filter((i) => i.id !== id) })
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => onChange({ ...project, name: e.target.value })}
        />
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
        {saveError && <span className="error">{saveError}</span>}
      </header>

      <section>
        <h2>Acteurs</h2>
        <div className="col-headers">
          <span className="col-color">Couleur</span>
          <span className="col-name">Nom</span>
        </div>
        <ul>
          {project.actors.map((a) => (
            <li key={a.id}>
              <input type="color" value={a.color} onChange={(e) => updateActor(a.id, { color: e.target.value })} />
              <input value={a.name} onChange={(e) => updateActor(a.id, { name: e.target.value })} />
              {/* Ligne de visibilité (service blueprint, ADR-064) : un
                  acteur back-stage n'interagit jamais directement avec le
                  client — regroupé après les front-stage dans le
                  diagramme, séparé par un trait. Front-stage (décoché)
                  reste le comportement par défaut, y compris pour les
                  acteurs créés avant l'introduction de ce champ. */}
              <label className="actor-backstage-toggle" title="Acteur back-stage : jamais en contact direct avec le client (support interne)">
                <input
                  type="checkbox"
                  checked={Boolean(a.backstage)}
                  onChange={(e) => updateActor(a.id, { backstage: e.target.checked })}
                />
                back-stage
              </label>
              <button type="button" className="danger" onClick={() => removeActor(a.id)}>
                supprimer
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addActor}>
          + Ajouter un acteur
        </button>
      </section>

      <section>
        <h2>Phases</h2>
        <div className="col-headers">
          <span className="col-icon">Icône</span>
          <span className="col-name">Nom</span>
          <span className="col-duration">Durée</span>
          <span className="col-satisfaction">Satisfaction</span>
          {/* Fantômes (masqués, inertes) des boutons de réordonnancement et
              de suppression de chaque ligne : sans eux, "Nom" (seule
              colonne flex: 1 de cet en-tête) grandirait plus que son
              homologue dans les lignes en dessous — qui, elles, ont ces
              boutons en plus — et décalerait Durée/Satisfaction vers la
              droite par rapport aux champs qu'ils sont censés surmonter.
              Réutilisent le même contenu que les vrais boutons pour garder
              exactement la même largeur, plutôt qu'un espaceur à largeur
              devinée. */}
          <span className="reorder-buttons col-headers-ghost" aria-hidden="true">
            <button type="button" className="reorder-btn" tabIndex={-1}>
              <ChevronLeft size={14} />
            </button>
            <button type="button" className="reorder-btn" tabIndex={-1}>
              <ChevronRight size={14} />
            </button>
          </span>
          <button type="button" className="danger col-headers-ghost" aria-hidden="true" tabIndex={-1}>
            supprimer
          </button>
        </div>
        <ul>
          {[...project.phases]
            .sort((a, b) => a.order - b.order)
            .map((p, index, sorted) => (
            <li key={p.id}>
              <input
                className="phase-icon-input"
                value={p.icon}
                onChange={(e) => updatePhase(p.id, { icon: e.target.value })}
                placeholder="🍽️"
                title="Emoji illustrant cette phase (mode storyboard du diagramme)"
              />
              <input value={p.name} onChange={(e) => updatePhase(p.id, { name: e.target.value })} />
              {/* Durée + satisfaction fusionnées dans une même ligne du
                  diagramme (ADR-065) — vide/"—" par défaut, aucune des
                  deux n'apparaît alors dans le diagramme. */}
              <input
                className="phase-duration-input"
                value={p.duration ?? ''}
                onChange={(e) => updatePhase(p.id, { duration: e.target.value })}
                placeholder="ex. 15 min"
                title="Durée typique de cette étape (texte libre)"
              />
              <select
                className="phase-satisfaction-select"
                value={p.satisfactionScore ?? 0}
                onChange={(e) => updatePhase(p.id, { satisfactionScore: Number(e.target.value) })}
                title="Ressenti client typique à cette étape (courbe de satisfaction)"
              >
                <option value={0}>— satisfaction —</option>
                <option value={1}>😞 Très insatisfait</option>
                <option value={2}>😕 Insatisfait</option>
                <option value={3}>😐 Neutre</option>
                <option value={4}>🙂 Satisfait</option>
                <option value={5}>😄 Très satisfait</option>
              </select>
              {/* Réordonnancement du backbone (ADR-069) : déplace la phase
                  dans la séquence chronologique du diagramme, qui en
                  découle directement (Phase.order pilote l'ordre des
                  colonnes — voir layout.ts). Toujours visible (contrairement
                  à "supprimer" ci-dessous) : un contrôle de navigation
                  fréquent, pas une action destructrice rare. */}
              <span className="reorder-buttons">
                <button
                  type="button"
                  className="reorder-btn"
                  onClick={() => movePhase(p.id, -1)}
                  disabled={index === 0}
                  title="Déplacer plus tôt dans la séquence"
                  aria-label={`Déplacer la phase « ${p.name} » plus tôt`}
                >
                  <ChevronLeft size={14} />
                </button>
                <button
                  type="button"
                  className="reorder-btn"
                  onClick={() => movePhase(p.id, 1)}
                  disabled={index === sorted.length - 1}
                  title="Déplacer plus tard dans la séquence"
                  aria-label={`Déplacer la phase « ${p.name} » plus tard`}
                >
                  <ChevronRight size={14} />
                </button>
              </span>
              <button type="button" className="danger" onClick={() => removePhase(p.id)}>
                supprimer
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addPhase}>
          + Ajouter une phase
        </button>
      </section>

      <section>
        <h2>Activités</h2>
        <div className="col-headers">
          <span className="col-name">Nom</span>
          <span className="col-select">Acteur</span>
          <span className="col-select">Phase</span>
          {/* Voir le commentaire équivalent dans la section Phases
              ci-dessus : même correction d'alignement. */}
          <button type="button" className="danger col-headers-ghost" aria-hidden="true" tabIndex={-1}>
            supprimer
          </button>
        </div>
        <ul>
          {project.activities.map((act) => (
            <li key={act.id}>
              <input value={act.name} onChange={(e) => updateActivity(act.id, { name: e.target.value })} />
              <select value={act.actorId} onChange={(e) => updateActivity(act.id, { actorId: e.target.value })}>
                {project.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select value={act.phaseId} onChange={(e) => updateActivity(act.id, { phaseId: e.target.value })}>
                {project.phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className="danger" onClick={() => removeActivity(act.id)}>
                supprimer
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addActivity} disabled={project.actors.length === 0 || project.phases.length === 0}>
          + Ajouter une activité
        </button>
      </section>

      <section>
        <h2>Interactions</h2>
        <div className="col-headers">
          <span className="col-select">Depuis</span>
          <span className="col-arrow-spacer" aria-hidden="true" />
          <span className="col-select">Vers</span>
          <span className="col-name">Information échangée</span>
          <span className="col-name">Condition (embranchement)</span>
          {/* Voir le commentaire équivalent dans la section Phases
              ci-dessus : même correction d'alignement. */}
          <button type="button" className="danger col-headers-ghost" aria-hidden="true" tabIndex={-1}>
            supprimer
          </button>
        </div>
        <ul>
          {project.interactions.map((i) => (
            <li key={i.id}>
              <select value={i.fromActivityId} onChange={(e) => updateInteraction(i.id, { fromActivityId: e.target.value })}>
                {project.activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <span className="col-arrow-spacer">→</span>
              <select value={i.toActivityId} onChange={(e) => updateInteraction(i.id, { toActivityId: e.target.value })}>
                {project.activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <input
                value={i.information}
                onChange={(e) => updateInteraction(i.id, { information: e.target.value })}
                placeholder="Information échangée"
              />
              <input
                value={i.condition ?? ''}
                onChange={(e) => updateInteraction(i.id, { condition: e.target.value || undefined })}
                placeholder="Ex. paiement refusé"
              />
              <button type="button" className="danger" onClick={() => removeInteraction(i.id)}>
                supprimer
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addInteraction} disabled={project.activities.length < 2}>
          + Ajouter une interaction
        </button>
      </section>
    </div>
  )
}
