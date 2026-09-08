import { useState } from 'react'
import { api } from '../../api/client'
import type { Project, Specification, SpecificationType } from '../../api/types'
import { mergeSpecDrafts } from './mergeSpecDrafts'
import { TraceabilityMatrix } from './TraceabilityMatrix'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const SPEC_TYPES: { value: SpecificationType; label: string }[] = [
  { value: 'StakeholderNeed', label: 'Besoin partie prenante (SSS)' },
  { value: 'SystemRequirement', label: 'Exigence système' },
  { value: 'SubsystemRequirement', label: 'Exigence sous-système' },
  { value: 'VerificationCriterion', label: 'Critère de vérification' },
]

interface Props {
  project: Project
  onChange: (project: Project) => void
  onSaved: () => void
}

export function SpecificationsPanel({ project, onChange, onSaved }: Props) {
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateNotConfigured, setGenerateNotConfigured] = useState(false)
  const [generateInfo, setGenerateInfo] = useState<string | null>(null)

  async function handleGenerateSss() {
    if (project.activities.length === 0) return
    setGenerating(true)
    setGenerateError(null)
    setGenerateNotConfigured(false)
    setGenerateInfo(null)
    try {
      const activityRefs = project.activities.map((a) => ({
        name: a.name,
        actorName: project.actors.find((actor) => actor.id === a.actorId)?.name ?? '',
      }))
      const drafts = await api.generateSpecifications(activityRefs)
      const result = mergeSpecDrafts(project, drafts)
      onChange(result.project)
      const parts = [`${result.addedCount} SSS proposée${result.addedCount > 1 ? 's' : ''}`]
      if (result.unmatchedActivities.length > 0) {
        parts.push(`${result.unmatchedActivities.length} activité(s) non reconnue(s) : ${result.unmatchedActivities.join(', ')}`)
      }
      setGenerateInfo(parts.join(' — '))
    } catch (e) {
      const message = String(e)
      if (message.includes('ANTHROPIC_API_KEY')) {
        setGenerateNotConfigured(true)
      } else {
        setGenerateError(message)
      }
    } finally {
      setGenerating(false)
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

  function addSpec() {
    const spec: Specification = {
      id: newId('spec'),
      code: `SPEC-${String(project.specifications.length + 1).padStart(3, '0')}`,
      type: 'StakeholderNeed',
      text: '',
      status: 'draft',
      priority: 'must',
    }
    onChange({ ...project, specifications: [...project.specifications, spec] })
  }

  function updateSpec(id: string, patch: Partial<Specification>) {
    onChange({
      ...project,
      specifications: project.specifications.map((s) => (s.id === id ? { ...s, ...patch } : s)),
    })
  }

  function removeSpec(id: string) {
    onChange({
      ...project,
      specifications: project.specifications.filter((s) => s.id !== id),
      activities: project.activities.map((a) => ({
        ...a,
        traceLinks: a.traceLinks.filter((specId) => specId !== id),
      })),
    })
  }

  return (
    <div className="editor">
      <header className="editor-header">
        <h2 className="panel-title">Spécifications</h2>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
        {saveError && <span className="error">{saveError}</span>}
      </header>

      <section>
        <div className="nl-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={handleGenerateSss}
            disabled={generating || project.activities.length === 0}
          >
            {generating ? 'Génération…' : 'Proposer les SSS pour toutes les activités (IA)'}
          </button>
        </div>
        {generateNotConfigured && (
          <div className="nl-warning">
            Génération indisponible : aucune clé ANTHROPIC_API_KEY n'est configurée côté serveur. Ajoutez les
            spécifications manuellement ci-dessous, ou définissez <code>ANTHROPIC_API_KEY</code> avant de lancer{' '}
            <code>go run ./cmd/server</code>.
          </div>
        )}
        {generateError && <p className="error">{generateError}</p>}
        {generateInfo && <p className="generate-info">{generateInfo}</p>}

        <ul className="spec-list">
          {project.specifications.map((spec) => (
            <li key={spec.id} className="spec-card">
              <div className="spec-card-meta">
                <input
                  className="spec-code"
                  value={spec.code}
                  onChange={(e) => updateSpec(spec.id, { code: e.target.value })}
                />
                <select value={spec.type} onChange={(e) => updateSpec(spec.id, { type: e.target.value as SpecificationType })}>
                  {SPEC_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select value={spec.parentId ?? ''} onChange={(e) => updateSpec(spec.id, { parentId: e.target.value || undefined })}>
                  <option value="">— sans parent —</option>
                  {project.specifications
                    .filter((s) => s.id !== spec.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code}
                      </option>
                    ))}
                </select>
                <select
                  value={spec.status}
                  onChange={(e) => updateSpec(spec.id, { status: e.target.value as Specification['status'] })}
                >
                  <option value="draft">brouillon</option>
                  <option value="approved">approuvée</option>
                  <option value="deprecated">obsolète</option>
                </select>
                <button type="button" className="danger" onClick={() => removeSpec(spec.id)}>
                  supprimer
                </button>
              </div>
              <textarea
                className="spec-text"
                rows={2}
                placeholder="Texte de l'exigence"
                value={spec.text}
                onChange={(e) => updateSpec(spec.id, { text: e.target.value })}
              />
              {spec.rationale && (
                <textarea
                  className="spec-rationale"
                  rows={1}
                  placeholder="Justification"
                  value={spec.rationale}
                  onChange={(e) => updateSpec(spec.id, { rationale: e.target.value })}
                />
              )}
            </li>
          ))}
          {project.specifications.length === 0 && <li className="empty">Aucune spécification pour l'instant.</li>}
        </ul>
        <button type="button" onClick={addSpec}>
          + Ajouter une spécification
        </button>
      </section>

      <section>
        <h2>Matrice de traçabilité</h2>
        <TraceabilityMatrix project={project} onChange={onChange} />
      </section>
    </div>
  )
}
