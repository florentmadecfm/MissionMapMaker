import { useState } from 'react'
import { api } from '../../api/client'
import type { Project } from '../../api/types'
import { mergeDraft } from './mergeDraft'

interface Props {
  project: Project
  onChange: (project: Project) => void
  onGenerated: () => void
}

const EXAMPLE =
  "Le fonctionnement d'un restaurant : les acteurs sont les clients, les serveurs, le sommelier, les cuisiniers et les plongeurs. " +
  "Le processus se déroule en trois phases : l'arrivée des clients, puis le repas, puis le paiement. " +
  "À l'arrivée, le serveur accueille et installe les clients, et le sommelier présente la carte des vins. " +
  "Pendant le repas, le serveur prend la commande et transmet un bon de commande au cuisinier, qui prépare les plats ; " +
  "le serveur sert ensuite les plats, et le plongeur débarrasse et lave la vaisselle. " +
  "Au moment de payer, le client demande l'addition et le serveur encaisse le paiement."

export function NlInput({ project, onChange, onGenerated }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)

  async function handleGenerate() {
    if (!text.trim()) return
    setLoading(true)
    setError(null)
    setNotConfigured(false)
    try {
      const draft = await api.generateFromText(text)
      onChange(mergeDraft(project, draft))
      onGenerated()
    } catch (e) {
      const message = String(e)
      if (message.includes('ANTHROPIC_API_KEY')) {
        setNotConfigured(true)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="nl-input">
      <p className="nl-hint">
        Décrivez le processus en langage naturel (acteurs, phases, qui fait quoi, ce qui est échangé). Claude
        propose une ébauche que vous pourrez relire et modifier dans l'onglet Édition avant de sauvegarder.
      </p>
      <textarea
        rows={8}
        placeholder="Ex. le fonctionnement d'un restaurant..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="nl-actions">
        <button type="button" onClick={handleGenerate} disabled={loading || !text.trim()}>
          {loading ? 'Génération…' : 'Générer'}
        </button>
        <button type="button" className="secondary" onClick={() => setText(EXAMPLE)} disabled={loading}>
          Charger l'exemple restaurant
        </button>
      </div>

      {notConfigured && (
        <div className="nl-warning">
          Génération indisponible : aucune clé ANTHROPIC_API_KEY n'est configurée côté serveur. Définissez
          la variable d'environnement <code>ANTHROPIC_API_KEY</code> avant de lancer <code>go run ./cmd/server</code>,
          ou utilisez la saisie manuelle dans l'onglet Édition.
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
