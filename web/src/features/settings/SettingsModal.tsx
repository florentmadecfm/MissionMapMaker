import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Provider, Settings } from '../../api/types'
import { PromptsPanel } from './PromptsPanel'
import { SkillsPanel } from './SkillsPanel'

interface Props {
  onClose: () => void
  // Notifie l'écran parent à chaque fois que l'état "un fournisseur
  // LLM est configuré" change (chargement initial, enregistrement,
  // retrait) — sert par ex. à afficher/masquer la pastille d'alerte sur
  // le bouton Paramètres de la barre latérale sans dupliquer l'appel API.
  onSettingsChange?: (configured: boolean) => void
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

const PROVIDER_DEFAULT_BASE_URL: Record<Provider, string> = {
  anthropic: 'https://api.anthropic.com',
  mistral: 'https://api.mistral.ai/v1/chat/completions',
}

type SettingsTab = 'connexion' | 'prompts' | 'skills'

export function SettingsModal({ onClose, onSettingsChange }: Props) {
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('connexion')
  const [settings, setSettings] = useState<Settings | null>(null)
  const [provider, setProvider] = useState<Provider>('anthropic')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
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
        onSettingsChange?.(s.configured)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
    // Chargement une seule fois au montage de la modale (pas à chaque
    // fois que le parent recrée onSettingsChange) : tableau de
    // dépendances volontairement vide.
  }, [])

  function handleProviderChange(next: Provider) {
    setProvider(next)
    setModel('')
    setBaseUrl('')
    setInfo(null)
  }

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      const s = await api.saveApiKey(provider, apiKey.trim(), model.trim() || undefined, baseUrl.trim() || undefined)
      setSettings(s)
      setApiKey('')
      setInfo(`Clé ${PROVIDER_LABELS[provider]} enregistrée. La génération assistée est activée dès maintenant.`)
      onSettingsChange?.(s.configured)
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
      setSettings({ configured: false, provider: '', model: '', baseUrl: '' })
      setInfo('Clé retirée. La génération assistée est désactivée.')
      onSettingsChange?.(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  const activeLabel = settings?.configured && settings.provider ? PROVIDER_LABELS[settings.provider] : null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-page" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Paramètres</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        <nav className="tabs">
          <button
            type="button"
            className={settingsTab === 'connexion' ? 'active' : ''}
            onClick={() => setSettingsTab('connexion')}
          >
            Connexion au modèle
          </button>
          <button
            type="button"
            className={settingsTab === 'prompts' ? 'active' : ''}
            onClick={() => setSettingsTab('prompts')}
          >
            Prompts
          </button>
          <button
            type="button"
            className={settingsTab === 'skills' ? 'active' : ''}
            onClick={() => setSettingsTab('skills')}
          >
            Skills
          </button>
        </nav>

        {settingsTab === 'prompts' ? (
          <PromptsPanel />
        ) : settingsTab === 'skills' ? (
          <SkillsPanel />
        ) : loading ? (
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

            <label className="field-label" htmlFor="settings-base-url">
              URL de base (optionnel)
            </label>
            <input
              id="settings-base-url"
              type="text"
              placeholder={
                settings?.configured && settings.provider === provider && settings.baseUrl
                  ? settings.baseUrl
                  : PROVIDER_DEFAULT_BASE_URL[provider]
              }
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
            />
            <p className="settings-hint">
              Pour un proxy, un déploiement régional/entreprise ou un service compatible auto-hébergé. Laissez vide
              pour utiliser l'API {PROVIDER_LABELS[provider]} standard.
            </p>

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
