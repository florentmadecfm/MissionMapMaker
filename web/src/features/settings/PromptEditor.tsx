import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { PromptSettings, PromptSettingsResponse } from '../../api/types'

export interface PromptFieldDef {
  key: keyof PromptSettings
  title: string
  description: string
}

interface Props {
  fields: PromptFieldDef[]
  hint: string
}

// Éditeur générique d'un sous-ensemble des 6 champs de PromptSettings, en
// sous-onglets — partagé par SkillsPanel.tsx (les 3 "skills", la méthode
// détaillée) et PromptsPanel.tsx (les 3 "prompts", contexte + objectif),
// qui ne diffèrent que par QUELS champs ils éditent et leurs libellés.
// Recharge/enregistre toujours les 6 champs ensemble (une seule ressource
// côté serveur, GET/PUT /api/settings/prompts) même si un panel n'en
// affiche qu'une partie : sauvegarder depuis l'onglet Skills ne doit pas
// écraser une modification pas encore enregistrée faite dans l'onglet
// Prompts, et réciproquement — d'où le rechargement de `data`/`values`
// complet à chaque montage plutôt qu'un état partagé entre les deux panels.
export function PromptEditor({ fields, hint }: Props) {
  const [active, setActive] = useState<keyof PromptSettings>(fields[0].key)
  const [data, setData] = useState<PromptSettingsResponse | null>(null)
  const [values, setValues] = useState<PromptSettings | null>(null)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    api
      .getPrompts()
      .then((d) => {
        setData(d)
        setValues({ ...d })
      })
      .catch((e) => setError(String(e)))
  }, [])

  async function persist(next: PromptSettings, successMessage: string) {
    setError(null)
    setInfo(null)
    try {
      const saved = await api.savePrompts(next)
      setData(saved)
      setValues({ ...saved })
      setInfo(successMessage)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleSave(key: keyof PromptSettings) {
    if (!values) return
    setSavingKey(key)
    await persist(values, 'Modifications enregistrées.')
    setSavingKey(null)
  }

  async function handleReset(key: keyof PromptSettings) {
    if (!data || !values) return
    const next = { ...values, [key]: data.defaults[key] }
    setValues(next)
    setSavingKey(key)
    await persist(next, 'Réinitialisé au texte par défaut.')
    setSavingKey(null)
  }

  if (!data || !values) {
    return <p>{error ? <span className="error">{error}</span> : 'Chargement…'}</p>
  }

  const field = fields.find((f) => f.key === active) ?? fields[0]

  return (
    <div className="skills-panel">
      <p className="nl-hint">{hint}</p>

      {/* Sous-onglets : un par champ, plutôt que tous empilés — chaque
          texte fait plusieurs paragraphes, les empiler rendait le
          défilement de la modale peu lisible dès qu'on voulait comparer ou
          éditer un seul des champs. */}
      <nav className="tabs sub-tabs">
        {fields.map((f) => (
          <button key={f.key} type="button" className={active === f.key ? 'active' : ''} onClick={() => setActive(f.key)}>
            {f.title}
            {data.customized[f.key] && <span className="tab-customized-dot" aria-label="Personnalisé" />}
          </button>
        ))}
      </nav>

      <div className="skill-card">
        <div className="skill-card-header">
          <h3>{field.title}</h3>
          {data.customized[field.key] ? (
            <span className="status-badge status-ok">Personnalisé</span>
          ) : (
            <span className="status-badge status-off">Par défaut</span>
          )}
        </div>
        <p className="skill-card-description">{field.description}</p>
        <textarea
          rows={16}
          value={values[field.key]}
          onChange={(e) => setValues({ ...values, [field.key]: e.target.value })}
        />
        <div className="nl-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleSave(field.key)}
            disabled={savingKey === field.key}
          >
            {savingKey === field.key ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={() => handleReset(field.key)}
            disabled={savingKey === field.key || !data.customized[field.key]}
          >
            Réinitialiser
          </button>
        </div>
      </div>

      {info && <p className="generate-info">{info}</p>}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
