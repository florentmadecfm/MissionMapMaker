import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { PromptSettings, PromptSettingsResponse } from '../../api/types'

// Les 3 skills correspondent exactement aux 3 capacités de génération
// assistée exposées par le backend (internal/llm/prompts.go) : pas de
// "création" d'un 4e skill arbitraire, ce sont des emplacements fixes —
// éditer et réinitialiser leur texte est ce que permet le mode CRUD
// demandé ici (Read : texte actuel : Update : édition + Enregistrer ;
// Delete : Réinitialiser retire la personnalisation, revient au texte par
// défaut).
const SKILLS: { key: keyof PromptSettings; title: string; description: string }[] = [
  {
    key: 'process',
    title: 'Construire la mission map',
    description:
      "Extrait acteurs, phases, activités et interactions à partir d'une description en langage naturel — utilisé par l'onglet Générer et par la mise à jour du diagramme.",
  },
  {
    key: 'specification',
    title: 'Construire les SSS',
    description: 'Propose des besoins partie prenante (SSS, format INCOSE) pour les activités du diagramme.',
  },
  {
    key: 'testScenario',
    title: 'Construire les scénarios de test',
    description: 'Propose des scénarios de test de vérification/validation (V&V) pour les spécifications.',
  },
]

export function SkillsPanel() {
  const [activeSkill, setActiveSkill] = useState<keyof PromptSettings>('process')
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
        setValues({ process: d.process, specification: d.specification, testScenario: d.testScenario })
      })
      .catch((e) => setError(String(e)))
  }, [])

  async function persist(next: PromptSettings, successMessage: string) {
    setError(null)
    setInfo(null)
    try {
      const saved = await api.savePrompts(next)
      setData(saved)
      setValues({ process: saved.process, specification: saved.specification, testScenario: saved.testScenario })
      setInfo(successMessage)
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleSave(key: keyof PromptSettings) {
    if (!values) return
    setSavingKey(key)
    await persist(values, 'Skill enregistré.')
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

  const skill = SKILLS.find((s) => s.key === activeSkill) ?? SKILLS[0]

  return (
    <div className="skills-panel">
      <p className="nl-hint">
        Ces consignes ("skills") pilotent la génération assistée par LLM. Les adapter est une fonctionnalité
        avancée : un texte incohérent peut dégrader la qualité des propositions, voire empêcher la mise à jour
        incrémentale du diagramme de fonctionner correctement (voir ADR-040).
      </p>

      {/* Sous-onglets : un par skill, plutôt que les 3 empilées — chaque
          consigne fait plusieurs paragraphes, les empiler rendait le
          défilement de la modale peu lisible dès qu'on voulait comparer ou
          éditer une seule des trois. */}
      <nav className="tabs sub-tabs">
        {SKILLS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={activeSkill === s.key ? 'active' : ''}
            onClick={() => setActiveSkill(s.key)}
          >
            {s.title}
            {data.customized[s.key] && <span className="tab-customized-dot" aria-label="Personnalisé" />}
          </button>
        ))}
      </nav>

      <div className="skill-card">
        <div className="skill-card-header">
          <h3>{skill.title}</h3>
          {data.customized[skill.key] ? (
            <span className="status-badge status-ok">Personnalisé</span>
          ) : (
            <span className="status-badge status-off">Par défaut</span>
          )}
        </div>
        <p className="skill-card-description">{skill.description}</p>
        <textarea
          rows={16}
          value={values[skill.key]}
          onChange={(e) => setValues({ ...values, [skill.key]: e.target.value })}
        />
        <div className="nl-actions">
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleSave(skill.key)}
            disabled={savingKey === skill.key}
          >
            {savingKey === skill.key ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button
            type="button"
            onClick={() => handleReset(skill.key)}
            disabled={savingKey === skill.key || !data.customized[skill.key]}
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
