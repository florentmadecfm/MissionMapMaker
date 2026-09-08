import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import type { Settings } from '../../api/types'

interface Props {
  onClose: () => void
}

export function SettingsModal({ onClose }: Props) {
  const [settings, setSettings] = useState<Settings | null>(null)
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
        setModel(s.model)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  async function handleSave() {
    if (!apiKey.trim()) return
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      const s = await api.saveApiKey(apiKey.trim(), model.trim() || undefined)
      setSettings(s)
      setApiKey('')
      setInfo('Clé enregistrée. La génération assistée est activée dès maintenant.')
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
      setSettings({ configured: false, model })
      setInfo('Clé retirée. La génération assistée est désactivée.')
    } catch (e) {
      setError(String(e))
    } finally {
      setSaving(false)
    }
  }

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
              {settings?.configured ? (
                <span className="status-badge status-ok">Clé API configurée</span>
              ) : (
                <span className="status-badge status-off">Aucune clé API configurée</span>
              )}
            </div>

            <p className="nl-hint">
              La clé permet la génération assistée par langage naturel (onglet Générer) et la proposition de SSS
              (onglet Spécifications). Elle est stockée localement sur cette machine, hors des fichiers projet.
            </p>

            <label className="field-label" htmlFor="settings-api-key">
              Clé API Anthropic
            </label>
            <input
              id="settings-api-key"
              type="password"
              placeholder="sk-ant-..."
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
              placeholder={settings?.model || 'claude-opus-5'}
              value={model}
              onChange={(e) => setModel(e.target.value)}
            />

            <div className="nl-actions">
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !apiKey.trim()}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {settings?.configured && (
                <button type="button" className="danger" onClick={handleClear} disabled={saving}>
                  Retirer la clé
                </button>
              )}
            </div>

            {info && <p className="generate-info">{info}</p>}
            {error && <p className="error">{error}</p>}

            <p className="settings-note">
              Si la variable d'environnement <code>ANTHROPIC_API_KEY</code> est définie au démarrage du serveur,
              elle est utilisée en priorité au prochain lancement.
            </p>
          </>
        )}
      </div>
    </div>
  )
}
