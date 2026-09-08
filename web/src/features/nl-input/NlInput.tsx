import { useRef, useState } from 'react'
import { api } from '../../api/client'
import type { Project } from '../../api/types'
import { mergeDraft } from './mergeDraft'
import { extractPdfText } from './pdfText'

interface Props {
  project: Project
  onChange: (project: Project) => void
  onGenerated: () => void
}

// Doit rester cohérent avec maxTextLength côté serveur
// (internal/service/generate_service.go) : au-delà, la génération est de
// toute façon rejetée, autant tronquer et prévenir tout de suite plutôt
// que de laisser échouer l'appel.
const MAX_TEXT_LENGTH = 20000

const EXAMPLE =
  "Le fonctionnement d'un restaurant : les acteurs sont les clients, les serveurs, le sommelier, les cuisiniers, " +
  "les plongeurs et le manager de salle. Le processus se déroule en cinq phases : la réservation, l'arrivée des " +
  "clients, le repas, le paiement, puis le départ. " +
  "Pendant la réservation, le client réserve une table et le serveur confirme la réservation. " +
  "À l'arrivée, le manager vérifie la disponibilité des tables, le serveur accueille et installe les clients, " +
  "et le sommelier présente la carte des vins. " +
  "Pendant le repas, le serveur prend la commande et transmet un bon de commande au cuisinier ; le sommelier " +
  "conseille un accord mets-vins ; le cuisinier prépare les plats et gère aussi les allergies alimentaires en " +
  "tenant compte des alertes transmises par le serveur ; le serveur sert ensuite les plats, puis vérifie la " +
  "satisfaction des clients et signale toute réclamation au manager, qui la traite ; le plongeur débarrasse et " +
  "lave la vaisselle. " +
  "Au moment de payer, le client demande l'addition, le serveur la prépare puis encaisse le paiement, et le " +
  "manager valide les remises éventuelles. " +
  "Au départ, le plongeur débarrasse et nettoie la table, et le serveur remercie et salue les clients."

export function NlInput({ project, onChange, onGenerated }: Props) {
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notConfigured, setNotConfigured] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const [pdfInfo, setPdfInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      if (message.includes('clé API non configurée')) {
        setNotConfigured(true)
      } else {
        setError(message)
      }
    } finally {
      setLoading(false)
    }
  }

  async function handlePdfSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de reselectionner le même fichier après un échec
    if (!file) return

    setPdfLoading(true)
    setPdfError(null)
    setPdfInfo(null)
    try {
      const extracted = (await extractPdfText(file)).trim()
      if (!extracted) {
        setPdfError(
          "Aucun texte n'a pu être extrait de ce PDF — c'est probablement un document scanné (image) : l'OCR n'est pas encore pris en charge, seuls les PDF texte le sont.",
        )
        return
      }
      const truncated = extracted.length > MAX_TEXT_LENGTH
      setText(truncated ? extracted.slice(0, MAX_TEXT_LENGTH) : extracted)
      setPdfInfo(
        `Texte extrait de « ${file.name} » (${extracted.length} caractères)` +
          (truncated ? `, tronqué à ${MAX_TEXT_LENGTH} caractères — relisez avant de générer.` : '.'),
      )
    } catch (err) {
      setPdfError(`Échec de la lecture du PDF : ${String(err)}`)
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div className="nl-input">
      <p className="nl-hint">
        Décrivez le processus en langage naturel (acteurs, phases, qui fait quoi, ce qui est échangé), ou chargez un
        PDF texte dont le contenu sera extrait dans la zone ci-dessous. Claude propose une ébauche que vous pourrez
        relire et modifier dans l'onglet Édition avant de sauvegarder.
      </p>
      <textarea
        rows={8}
        maxLength={MAX_TEXT_LENGTH}
        placeholder="Ex. le fonctionnement d'un restaurant..."
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="nl-actions">
        <button type="button" className="btn-primary" onClick={handleGenerate} disabled={loading || !text.trim()}>
          {loading ? 'Génération…' : 'Générer'}
        </button>
        <button type="button" onClick={() => setText(EXAMPLE)} disabled={loading}>
          Charger l'exemple restaurant
        </button>
        <input ref={fileInputRef} type="file" accept="application/pdf" hidden onChange={handlePdfSelected} />
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={loading || pdfLoading}>
          {pdfLoading ? 'Lecture du PDF…' : 'Charger un PDF'}
        </button>
      </div>

      {pdfError && <p className="error">{pdfError}</p>}
      {pdfInfo && <p className="generate-info">{pdfInfo}</p>}

      {notConfigured && (
        <div className="nl-warning">
          Génération indisponible : aucune clé API n'est configurée. Ouvrez <strong>⚙ Paramètres</strong> en bas de
          la barre latérale pour en saisir une, ou utilisez la saisie manuelle dans l'onglet Édition.
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  )
}
