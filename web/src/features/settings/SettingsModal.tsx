import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Provider, Settings } from '../../api/types'

interface Props {
  onClose: () => void
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  mistral: 'Mistral AI',
}

const PROVIDER_KEY_PLACEHOLDER: Record<Provider, string> = {
  anthropic: 'sk-ant-...',
  mistral: 'Clé API Mistral',
}

const PROVIDER_DEFAULT_MODEL: Record<Provider, string> = {
  anthropic: 'claude-opus-5',
  mistral: 'mistral-large-latest',
}

export function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        if (s.provider) setProvider(s.provider)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  function handleProviderChange(next: Provider) {
    setProvider(next)
    setModel('')
    setInfo(null)
  }

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      const s = await api.saveApiKey(provider, apiKey.trim(), model.trim() || undefined)
      setSettings(s)
      setApiKey('')
      setInfo(`Clé ${PROVIDER_LABELS[provider]} enregistrée. La génération assistée est activée dès maintenant.`)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      await api.clearApiKey()
      setSettings({ configured: false, provider: '', model: '' })
      setInfo('Clé retirée. La génération assistée est désactivée.')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const activeLabel = settings?.configured && settings.provider ? PROVIDER_LABELS[settings.provider] : null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Paramètres</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {loading ? (
          <p>Chargement…</p>
        ) : (
          <>
            <div className="settings-status">
              {activeLabel ? (
                <span className="status-badge status-ok">{activeLabel} configuré</span>
              ) : (
                <span className="status-badge status-off">Aucun fournisseur configuré</span>
              )}
            </div>

            <p className="nl-hint">
              La clé permet la génération assistée par langage naturel (onglet Générer) et la proposition de SSS
              (onglet Spécifications). Elle est stockée localement sur cette machine, hors des fichiers projet.
            </p>

            <label className="field-label" htmlFor="settings-provider">
              Fournisseur
            </label>
            <select
              id="settings-provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
            >
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>

            <label className="field-label" htmlFor="settings-api-key">
              Clé API {PROVIDER_LABELS[provider]}
            </label>
            <input
              id="settings-api-key"
              type="password"
              placeholder={PROVIDER_KEY_PLACEHOLDER[provider]}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              autoComplete="off"
            />

            <label className="field-label" htmlFor="settings-model">
              Modèle (optionnel)
            </label>
            <input
              id="settings-model"
              type="text"
              placeholder={
                settings?.configured && settings.provider === provider && settings.model
                  ? settings.model
                  : PROVIDER_DEFAULT_MODEL[provider]
              }
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />

            <div className="nl-actions">
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !apiKey.trim()}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {activeLabel && (
                <button type="button" className="danger" onClick={handleClear} disabled={saving}>
                  Retirer la clé
                </button>
              )}
            </div>

            {info && <p className="generate-info">{info}</p>}
            {error && <p className="error">{error}</p>}

            <p className="settings-note">
              Basculer de fournisseur ne perd pas la clé de l'autre : chacune est mémorisée séparément. Si la
              variable d'environnement <code>ANTHROPIC_API_KEY</code> est définie au démarrage du serveur, elle est
              utilisée en priorité (fournisseur Anthropic) au prochain lancement.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
