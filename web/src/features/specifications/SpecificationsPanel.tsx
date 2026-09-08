import { useState } from 'react'
import { api } from '../../api/client'
import type { Project, Specification, SpecificationType } from '../../api/types'
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
        <button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Sauvegarde…' : 'Sauvegarder'}
        </button>
        {savedAt && <span className="saved-at">Sauvegardé à {savedAt}</span>}
        {saveError && <span className="error">{saveError}</span>}
      </header>

      <section>
        <ul className="spec-list">
          {project.specifications.map((spec) => (
            <li key={spec.id} className="spec-row">
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
              <input
                className="spec-text"
                placeholder="Texte de l'exigence"
                value={spec.text}
                onChange={(e) => updateSpec(spec.id, { text: e.target.value })}
              />
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
