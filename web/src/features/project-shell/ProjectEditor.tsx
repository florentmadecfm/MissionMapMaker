import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { Activity, Actor, Interaction, Phase, Product, Project } from '../../api/types'
import { ListFilterInput } from '../../components/ListFilterInput'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Le champ de recherche d'une liste ne s'affiche qu'au-delà de ce nombre
// d'éléments : sur un petit projet (le cas le plus courant), il n'aurait
// rien à filtrer et ne ferait qu'encombrer l'écran.
const FILTER_THRESHOLD = 8

function filterByQuery<T>(items: T[], query: string, fields: (item: T) => string[]): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => fields(item).some((f) => f.toLowerCase().includes(q)))
}

// Suggestions d'autocomplétion à partir des mêmes champs que le filtre
// lui-même (fields) : toute suggestion proposée donne donc forcément au
// moins un résultat une fois choisie.
function suggestionsFor<T>(items: T[], fields: (item: T) => string[]): string[] {
  const values = new Set<string>()
  for (const item of items) {
    for (const f of fields(item)) {
      const trimmed = f.trim()
      if (trimmed) values.add(trimmed)
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b))
}

interface Props {
  project: Project
  onChange: (project: Project) => void
  // Produits disponibles (écran Produits, ProjectShell.tsx) — pour le
  // sélecteur "Produit associé" ci-dessous. null tant que le premier
  // chargement n'a pas répondu : le sélecteur reste alors désactivé
  // plutôt que de proposer une liste vide trompeuse.
  products: Product[] | null
}

// Sauvegarde automatique (ProjectShell.tsx) : cet onglet ne persiste plus
// lui-même, il se contente de remonter chaque changement via onChange.
export function ProjectEditor({ project, onChange, products }: Props) {
  const [actorFilter, setActorFilter] = useState('')
  const [phaseFilter, setPhaseFilter] = useState('')
  const [activityFilter, setActivityFilter] = useState('')
  const [interactionFilter, setInteractionFilter] = useState('')

  function addActor() {
    const actor: Actor = {
      id: newId('act'),
      name: 'Nouveau persona',
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

  // Confirmation requise : supprime aussi, en cascade, toutes les
  // activités de ce persona — même garde-fou que removePhase/
  // removeActivity/removeInteraction ci-dessous.
  function removeActor(id: string, name: string) {
    if (!window.confirm(`Supprimer le persona « ${name} » ? Ses activités dans le diagramme seront aussi supprimées.`)) return
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

  // Confirmation requise : supprime aussi, en cascade, toutes les
  // activités de cette phase.
  function removePhase(id: string, name: string) {
    if (!window.confirm(`Supprimer la phase « ${name} » ? Ses activités dans le diagramme seront aussi supprimées.`)) return
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

  // `column`/`subRow` positionnent une activité au sein d'une seule paire
  // (acteur, phase) précise — voir resolveColumns, layout.ts, qui élargit
  // la phase visée au moins jusqu'à `column + 1` sous-colonnes. Changer
  // seulement actorId/phaseId (via updateActivity) laissait ces valeurs
  // à leur ancienne position, désormais sans rapport avec la nouvelle
  // paire : une activité déplacée en sous-colonne 1 dans son ancienne
  // phase réservait la même sous-colonne fantôme dans la phase cible,
  // même vide de toute autre activité. Remis à 0 (empilement automatique)
  // à chaque changement d'acteur ou de phase, comme le fait déjà le
  // glisser-déposer sur le diagramme (ProcessDiagram.tsx, handleNodeDragStop).
  function moveActivity(id: string, patch: Partial<Pick<Activity, 'actorId' | 'phaseId'>>) {
    onChange({
      ...project,
      activities: project.activities.map((a) =>
        a.id === id ? { ...a, ...patch, column: 0, subRow: 0, offsetX: 0, offsetY: 0 } : a,
      ),
    })
  }

  // Confirmation requise : supprime aussi, en cascade, toutes les
  // interactions qui partent ou arrivent sur cette activité.
  function removeActivity(id: string, name: string) {
    if (!window.confirm(`Supprimer l'activité « ${name} » ? Les interactions qui la concernent seront aussi supprimées.`)) return
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

  function removeInteraction(id: string, information: string) {
    if (!window.confirm(`Supprimer l'interaction « ${information} » ?`)) return
    onChange({ ...project, interactions: project.interactions.filter((i) => i.id !== id) })
  }

  const actorFields = (a: Actor) => [a.name]
  const filteredActors = filterByQuery(project.actors, actorFilter, actorFields)
  const actorSuggestions = suggestionsFor(project.actors, actorFields)

  // Triée AVANT filtrage : les boutons ‹/› de réordonnancement ont besoin
  // de la position de chaque phase dans la séquence COMPLÈTE (sortedPhases),
  // pas dans la liste affichée après recherche — sans quoi une phase
  // filtrée hors de vue serait sautée par erreur lors du réordonnancement
  // de ses voisines.
  const sortedPhases = [...project.phases].sort((a, b) => a.order - b.order)
  const phaseFields = (p: Phase) => [p.name]
  const filteredPhases = filterByQuery(sortedPhases, phaseFilter, phaseFields)
  const phaseSuggestions = suggestionsFor(sortedPhases, phaseFields)

  const activityFields = (act: Activity) => [
    act.name,
    project.actors.find((a) => a.id === act.actorId)?.name ?? '',
    project.phases.find((p) => p.id === act.phaseId)?.name ?? '',
  ]
  const filteredActivities = filterByQuery(project.activities, activityFilter, activityFields)
  const activitySuggestions = suggestionsFor(project.activities, activityFields)

  const interactionFields = (i: Interaction) => {
    const from = project.activities.find((a) => a.id === i.fromActivityId)
    const to = project.activities.find((a) => a.id === i.toActivityId)
    return [
      i.information,
      i.condition ?? '',
      i.physicalEvidence ?? '',
      from?.name ?? '',
      to?.name ?? '',
      project.actors.find((a) => a.id === from?.actorId)?.name ?? '',
      project.actors.find((a) => a.id === to?.actorId)?.name ?? '',
    ]
  }
  const filteredInteractions = filterByQuery(project.interactions, interactionFilter, interactionFields)
  const interactionSuggestions = suggestionsFor(project.interactions, interactionFields)

  return (
    <div className="editor">
      <header className="editor-header">
        <input
          className="project-name"
          value={project.name}
          onChange={(e) => onChange({ ...project, name: e.target.value })}
        />
        <label className="editor-product-select">
          Produit associé
          <select
            value={project.productId ?? ''}
            onChange={(e) => onChange({ ...project, productId: e.target.value || undefined })}
            disabled={!products}
          >
            <option value="">— aucun —</option>
            {products?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </header>

      <section>
        <h2>Personas</h2>
        {project.actors.length > FILTER_THRESHOLD && (
          <ListFilterInput
            value={actorFilter}
            onChange={setActorFilter}
            placeholder="Rechercher un persona…"
            suggestions={actorSuggestions}
          />
        )}
        <div className="col-headers">
          <span className="col-color">Couleur</span>
          <span className="col-name">Nom</span>
        </div>
        <ul>
          {filteredActors.length === 0 && actorFilter.trim() && (
            <li className="empty">Aucun persona ne correspond à « {actorFilter} ».</li>
          )}
          {filteredActors.map((a) => (
            <li key={a.id}>
              <input type="color" value={a.color} onChange={(e) => updateActor(a.id, { color: e.target.value })} />
              <input value={a.name} onChange={(e) => updateActor(a.id, { name: e.target.value })} />
              {/* Ligne de visibilité (service blueprint, ADR-064) : un
                  persona back-stage n'interagit jamais directement avec le
                  client — regroupé après les front-stage dans le
                  diagramme, séparé par un trait. Front-stage (décoché)
                  reste le comportement par défaut, y compris pour les
                  personas créés avant l'introduction de ce champ. */}
              <label className="actor-backstage-toggle" title="Persona back-stage : jamais en contact direct avec le client (support interne)">
                <input
                  type="checkbox"
                  checked={Boolean(a.backstage)}
                  onChange={(e) => updateActor(a.id, { backstage: e.target.checked })}
                />
                back-stage
              </label>
              <button type="button" className="danger" onClick={() => removeActor(a.id, a.name)}>
                supprimer
              </button>
            </li>
          ))}
        </ul>
        <button type="button" onClick={addActor}>
          + Ajouter un persona
        </button>
      </section>

      <section>
        <h2>Phases</h2>
        {project.phases.length > FILTER_THRESHOLD && (
          <ListFilterInput
            value={phaseFilter}
            onChange={setPhaseFilter}
            placeholder="Rechercher une phase…"
            suggestions={phaseSuggestions}
          />
        )}
        <div className="col-headers">
          <span className="col-icon">Icône</span>
          <span className="col-name">Nom</span>
          <span className="col-duration">Durée</span>
          <span className="col-satisfaction">Satisfaction</span>
          {/* Étiquette du groupe de boutons ‹/› ci-dessous — auparavant de
              simples icônes sans aucun texte au-dessus, seul un `title` au
              survol expliquait leur rôle (repéré peu clair à l'usage) :
              largeur figée à celle du groupe de boutons réel (voir
              .col-reorder, App.css) plutôt qu'un espaceur à largeur
              devinée, pour que Durée/Satisfaction restent alignées avec
              les champs qu'elles sont censées surmonter. */}
          <span className="col-reorder">Ordre</span>
          {/* Fantôme (masqué, inerte) du bouton de suppression de chaque
              ligne : sans lui, "Nom" (seule colonne flex: 1 de cet
              en-tête) grandirait plus que son homologue dans les lignes en
              dessous — qui, elles, ont ce bouton en plus — et décalerait
              Durée/Satisfaction vers la droite par rapport aux champs
              qu'ils sont censés surmonter. Réutilise le même contenu que
              le vrai bouton pour garder exactement la même largeur. */}
          <button type="button" className="danger col-headers-ghost" aria-hidden="true" tabIndex={-1}>
            supprimer
          </button>
        </div>
        <ul>
          {filteredPhases.length === 0 && phaseFilter.trim() && (
            <li className="empty">Aucune phase ne correspond à « {phaseFilter} ».</li>
          )}
          {filteredPhases.map((p) => {
            const index = sortedPhases.findIndex((x) => x.id === p.id)
            return (
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
                  disabled={index === sortedPhases.length - 1}
                  title="Déplacer plus tard dans la séquence"
                  aria-label={`Déplacer la phase « ${p.name} » plus tard`}
                >
                  <ChevronRight size={14} />
                </button>
              </span>
              <button type="button" className="danger" onClick={() => removePhase(p.id, p.name)}>
                supprimer
              </button>
            </li>
            )
          })}
        </ul>
        <button type="button" onClick={addPhase}>
          + Ajouter une phase
        </button>
      </section>

      <section>
        <h2>Activités</h2>
        {project.activities.length > FILTER_THRESHOLD && (
          <ListFilterInput
            value={activityFilter}
            onChange={setActivityFilter}
            placeholder="Rechercher une activité, un persona ou une phase…"
            suggestions={activitySuggestions}
          />
        )}
        <div className="col-headers">
          <span className="col-name">Nom</span>
          <span className="col-select">Persona</span>
          <span className="col-select">Phase</span>
          {/* Voir le commentaire équivalent dans la section Phases
              ci-dessus : même correction d'alignement. */}
          <button type="button" className="danger col-headers-ghost" aria-hidden="true" tabIndex={-1}>
            supprimer
          </button>
        </div>
        <ul>
          {filteredActivities.length === 0 && activityFilter.trim() && (
            <li className="empty">Aucune activité ne correspond à « {activityFilter} ».</li>
          )}
          {filteredActivities.map((act) => (
            <li key={act.id}>
              <input value={act.name} onChange={(e) => updateActivity(act.id, { name: e.target.value })} />
              <select value={act.actorId} onChange={(e) => moveActivity(act.id, { actorId: e.target.value })}>
                {project.actors.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <select value={act.phaseId} onChange={(e) => moveActivity(act.id, { phaseId: e.target.value })}>
                {project.phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="button" className="danger" onClick={() => removeActivity(act.id, act.name)}>
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
        {project.interactions.length > FILTER_THRESHOLD && (
          <ListFilterInput
            value={interactionFilter}
            onChange={setInteractionFilter}
            placeholder="Rechercher une interaction…"
            suggestions={interactionSuggestions}
          />
        )}
        <div className="col-headers">
          <span className="col-select">Depuis</span>
          <span className="col-arrow-spacer" aria-hidden="true" />
          <span className="col-select">Vers</span>
          <span className="col-name col-name-lg">Information échangée</span>
          <span className="col-name">Condition (embranchement)</span>
          <span className="col-name">Preuve(s) physique(s)</span>
          {/* Voir le commentaire équivalent dans la section Phases
              ci-dessus : même correction d'alignement. */}
          <button type="button" className="danger col-headers-ghost" aria-hidden="true" tabIndex={-1}>
            supprimer
          </button>
        </div>
        <ul>
          {filteredInteractions.length === 0 && interactionFilter.trim() && (
            <li className="empty">Aucune interaction ne correspond à « {interactionFilter} ».</li>
          )}
          {filteredInteractions.map((i) => (
            <li key={i.id} className="interaction-row">
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
              {/* "Information échangée" reçoit deux fois plus de largeur
                  que Condition/Preuve physique (voir .interaction-info-input,
                  App.css) : c'est le seul champ des trois renseigné pour
                  TOUTE interaction (les deux autres sont optionnels et
                  souvent vides) — mesuré sur un contenu réaliste : les 3
                  champs à parts égales tronquaient déjà "Choix des plats
                  et boissons..." avant ce correctif. title= sur les trois
                  : un survol suffit à lire la valeur complète sans
                  cliquer dedans. */}
              <input
                className="interaction-info-input"
                value={i.information}
                onChange={(e) => updateInteraction(i.id, { information: e.target.value })}
                placeholder="Information échangée"
                title={i.information || undefined}
              />
              <input
                value={i.condition ?? ''}
                onChange={(e) => updateInteraction(i.id, { condition: e.target.value || undefined })}
                placeholder="Ex. paiement refusé"
                title={i.condition || undefined}
              />
              <input
                value={i.physicalEvidence ?? ''}
                onChange={(e) => updateInteraction(i.id, { physicalEvidence: e.target.value || undefined })}
                placeholder="Ex. reçu papier"
                title={i.physicalEvidence || undefined}
              />
              <button type="button" className="danger" onClick={() => removeInteraction(i.id, i.information)}>
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
