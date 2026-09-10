import { useRef, useState } from 'react'
import { api } from '../../api/client'
import type { Activity, Actor, Interaction, Phase, Project } from '../../api/types'
import { exportProjectToExcel } from './exportExcel'
import { importProjectFromExcel } from './importExcel'
import { HeaderMenu } from './HeaderMenu'

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
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportProjectToExcel(project)
    } catch (e) {
      setExportError(String(e))
    } finally {
      setExporting(false)
    }
  }

  // Remplace les 6 collections du projet OUVERT par le contenu du fichier
  // (voir importExcel.ts) : comme toute autre modification de cet écran,
  // ce n'est qu'un nouvel état local tant que "Sauvegarder" n'a pas été
  // cliqué — mais la confirmation reste nécessaire, l'opération étant un
  // remplacement complet plutôt qu'un ajout (contrairement à la fusion
  // additive des ébauches générées par LLM).
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de resélectionner le même fichier après un échec
    if (!file) return
    if (
      !window.confirm(
        "Importer ce fichier Excel va remplacer les acteurs, phases, activités, interactions, spécifications et tests du projet ouvert (à sauvegarder ensuite pour confirmer). Continuer ?",
      )
    ) {
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      onChange(await importProjectFromExcel(file, project))
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImporting(false)
    }
  }

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
    const actor: Actor = { id: newId('act'), name: 'Nouvel acteur', color: '#2563eb', description: '', subLanes: 0 }
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
    const phase: Phase = { id: newId('ph'), name: 'Nouvelle phase', order: project.phases.length + 1, subColumns: 0 }
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
      description: '',
      userStories: [],
      traceLinks: [],
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
        <HeaderMenu>
          <button type="button" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Export…' : 'Exporter en Excel'}
          </button>
          <button type="button" onClick={() => importFileRef.current?.click()} disabled={importing}>
            {importing ? 'Import…' : 'Importer depuis Excel'}
          </button>
        </HeaderMenu>
        <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={handleImportFile} />
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
        {saveError && <span className="error">{saveError}</span>}
        {exportError && <span className="error">Export Excel : {exportError}</span>}
        {importError && <span className="error">Import Excel : {importError}</span>}
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
          <span className="col-name">Nom</span>
        </div>
        <ul>
          {project.phases.map((p) => (
            <li key={p.id}>
              <input value={p.name} onChange={(e) => updatePhase(p.id, { name: e.target.value })} />
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
