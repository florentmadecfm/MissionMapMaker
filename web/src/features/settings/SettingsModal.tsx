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

// Génération d'image (ADR-073/ADR-075) : l'Agents & Conversations API
// Mistral (outil image_generation) est un produit distinct de la
// génération de texte ci-dessus — endpoint et modèle par défaut
// différents. "mistral" est le seul fournisseur d'image valide
// aujourd'hui (voir Config.ImageGenerationProvider, router.go).
const IMAGE_PROVIDER_LABELS: Partial<Record<Provider, string>> = {
  mistral: 'Mistral AI',
}

const IMAGE_PROVIDER_DEFAULT_MODEL: Partial<Record<Provider, string>> = {
  mistral: 'mistral-medium-latest',
}

const IMAGE_PROVIDER_DEFAULT_BASE_URL: Partial<Record<Provider, string>> = {
  mistral: 'https://api.mistral.ai/v1/conversations',
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

  // Génération d'image (ADR-073/ADR-075) : bloc indépendant de la section
  // fournisseur/clé ci-dessus (Provider|apiKey|model|baseUrl) — une
  // connexion Mistral séparée, dédiée à l'Agents API (portrait de persona,
  // sketch de diagramme), utilisable même quand le fournisseur de texte
  // actif est Anthropic. Même patron état/handlers que la section
  // principale.
  const [imageProvider, setImageProvider] = useState<Provider>('mistral')
  const [imageApiKey, setImageApiKey] = useState('')
  const [imageModel, setImageModel] = useState('')
  const [imageBaseUrl, setImageBaseUrl] = useState('')
  const [imageSaving, setImageSaving] = useState(false)
  const [imageError, setImageError] = useState<string | null>(null)
  const [imageInfo, setImageInfo] = useState<string | null>(null)

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        setSettings(s)
        if (s.provider) setProvider(s.provider)
        if (s.imageGenerationProvider) setImageProvider(s.imageGenerationProvider)
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
      setSettings((s) => ({
        configured: false,
        provider: '',
        model: '',
        baseUrl: '',
        imageGenerationConfigured: s?.imageGenerationConfigured ?? false,
        imageGenerationProvider: s?.imageGenerationProvider ?? '',
        imageGenerationModel: s?.imageGenerationModel ?? '',
        imageGenerationBaseUrl: s?.imageGenerationBaseUrl ?? '',
      }))
      setInfo('Clé retirée. La génération assistée est désactivée.')
      onSettingsChange?.(false)
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

  function handleImageProviderChange(next: Provider) {
    setImageProvider(next)
    setImageModel('')
    setImageBaseUrl('')
    setImageInfo(null)
  }

  async function handleImageSave() {
    if (!imageApiKey.trim()) return
    setImageSaving(true)
    setImageError(null)
    setImageInfo(null)
    try {
      const result = await api.saveImageGenerationApiKey(
        imageProvider,
        imageApiKey.trim(),
        imageModel.trim() || undefined,
        imageBaseUrl.trim() || undefined,
      )
      setSettings((s) =>
        s
          ? {
              ...s,
              imageGenerationConfigured: result.imageGenerationConfigured,
              imageGenerationProvider: (result.imageGenerationProvider || '') as Provider | '',
              imageGenerationModel: result.imageGenerationModel,
              imageGenerationBaseUrl: result.imageGenerationBaseUrl,
            }
          : s,
      )
      setImageApiKey('')
      setImageInfo('Connexion enregistrée. La génération d’image est activée dès maintenant.')
    } catch (e) {
      setImageError(String(e))
    } finally {
      setImageSaving(false)
    }
  }

  async function handleImageClear() {
    setImageSaving(true)
    setImageError(null)
    setImageInfo(null)
    try {
      await api.clearImageGenerationApiKey()
      setSettings((s) =>
        s
          ? { ...s, imageGenerationConfigured: false, imageGenerationProvider: '', imageGenerationModel: '', imageGenerationBaseUrl: '' }
          : s,
      )
      setImageInfo('Connexion retirée. La génération d’image est désactivée.')
    } catch (e) {
      setImageError(String(e))
    } finally {
      setImageSaving(false)
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
            Connexion aux modèles
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

            <hr className="settings-divider" />

            <h3>Génération d'image</h3>
            <div className="settings-status">
              {settings?.imageGenerationConfigured ? (
                <span className="status-badge status-ok">Génération d'image activée</span>
              ) : (
                <span className="status-badge status-off">Génération d'image désactivée</span>
              )}
            </div>
            <p className="nl-hint">
              Connexion dédiée (Agents API, outil image_generation, FLUX1.1 Pro Ultra) — indépendante de la connexion
              ci-dessus, utilisable même si Anthropic est le fournisseur de texte actif. Permet de générer un
              portrait pour un persona (fiche persona) ou un sketch du diagramme de processus (onglet Diagramme).
            </p>

            <label className="field-label" htmlFor="settings-image-provider">
              Fournisseur
            </label>
            <select
              id="settings-image-provider"
              value={imageProvider}
              onChange={(e) => handleImageProviderChange(e.target.value as Provider)}
            >
              {(Object.keys(IMAGE_PROVIDER_LABELS) as Provider[]).map((p) => (
                <option key={p} value={p}>
                  {IMAGE_PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>

            <label className="field-label" htmlFor="settings-image-api-key">
              Clé API {IMAGE_PROVIDER_LABELS[imageProvider]}
            </label>
            <input
              id="settings-image-api-key"
              type="password"
              placeholder={`Clé API ${IMAGE_PROVIDER_LABELS[imageProvider]}`}
              value={imageApiKey}
              onChange={(e) => setImageApiKey(e.target.value)}
              autoComplete="off"
            />

            <label className="field-label" htmlFor="settings-image-model">
              Modèle (optionnel)
            </label>
            <input
              id="settings-image-model"
              type="text"
              placeholder={
                settings?.imageGenerationConfigured &&
                settings.imageGenerationProvider === imageProvider &&
                settings.imageGenerationModel
                  ? settings.imageGenerationModel
                  : IMAGE_PROVIDER_DEFAULT_MODEL[imageProvider]
              }
              value={imageModel}
              onChange={(e) => setImageModel(e.target.value)}
            />
            <p className="settings-hint">
              Pilote l'appel de l'outil image_generation (un modèle texte "orchestrateur") — pas le modèle d'image
              lui-même, fixé côté Mistral et non paramétrable.
            </p>

            <label className="field-label" htmlFor="settings-image-base-url">
              URL de base (optionnel)
            </label>
            <input
              id="settings-image-base-url"
              type="text"
              placeholder={
                settings?.imageGenerationConfigured &&
                settings.imageGenerationProvider === imageProvider &&
                settings.imageGenerationBaseUrl
                  ? settings.imageGenerationBaseUrl
                  : IMAGE_PROVIDER_DEFAULT_BASE_URL[imageProvider]
              }
              value={imageBaseUrl}
              onChange={(e) => setImageBaseUrl(e.target.value)}
            />
            <p className="settings-hint">
              Pour un proxy, un déploiement régional/entreprise ou un service compatible auto-hébergé. Laissez vide
              pour utiliser l'API Conversations Mistral standard.
            </p>

            <div className="nl-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={handleImageSave}
                disabled={imageSaving || !imageApiKey.trim()}
              >
                {imageSaving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {settings?.imageGenerationConfigured && (
                <button type="button" className="danger" onClick={handleImageClear} disabled={imageSaving}>
                  Retirer la connexion
                </button>
              )}
            </div>
            {imageInfo && <p className="generate-info">{imageInfo}</p>}
            {imageError && <p className="error">{imageError}</p>}
          </>
        )}
      </div>
    </div>
  )
}
