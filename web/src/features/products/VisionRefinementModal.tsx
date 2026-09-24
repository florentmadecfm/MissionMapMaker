import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { classifyGenerationError } from '../../api/generationErrors'
import type { DraftKpiSuggestion, Product, ProductKpi } from '../../api/types'
import { Spinner } from '../../components/Spinner'
import { buildProductContext } from './buildProductContext'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

interface Props {
  product: Product
  mode: 'vision' | 'kpis'
  onChange: (product: Product) => void
  onClose: () => void
}

type Status = 'loading' | 'ready' | 'not-configured' | 'rate-limited' | 'error'

interface VisionDraft {
  visionStatement: string
  differentiators: string[]
  pillars: string[]
}

// Modale de génération assistée par IA pour la vision produit (Phase 2 du
// plan Produit/Vision/KPI) — comme PainPointSolutionsModal.tsx (backdrop/
// header/statuts partagés), jamais appliquée automatiquement : seulement
// injectée dans le brouillon local de ProductsScreen.tsx via onChange,
// "Enregistrer" restant un geste explicite séparé (même flux que le reste
// de l'écran Produits).
//
// 2 modes, dans le même composant plutôt que dupliqués, tant l'habillage
// (statuts de chargement/erreur) est identique — seul le contenu du corps
// diffère :
// - 'vision' : UN brouillon (énoncé + différenciateurs + piliers), éditable
//   avant application en un geste ("Appliquer au brouillon").
// - 'kpis' : une LISTE de KPI proposés, chacun accepté individuellement,
//   dédoublonnés par nom (insensible à la casse) contre les KPI déjà
//   présents sur le produit — nature assez différente du mode vision pour
//   justifier un rendu propre, sans dupliquer le reste.
export function VisionRefinementModal({ product, mode, onChange, onClose }: Props) {
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)

  const [draft, setDraft] = useState<VisionDraft | null>(null)
  const [newDifferentiator, setNewDifferentiator] = useState('')
  const [newPillar, setNewPillar] = useState('')

  const [suggestions, setSuggestions] = useState<DraftKpiSuggestion[]>([])
  const [addedNames, setAddedNames] = useState<Set<string>>(new Set())

  function handleError(e: unknown) {
    switch (classifyGenerationError(e)) {
      case 'not-configured':
        setStatus('not-configured')
        break
      case 'rate-limited':
        setStatus('rate-limited')
        break
      default:
        setError(String(e))
        setStatus('error')
    }
  }

  function fetchDraft() {
    setStatus('loading')
    setError(null)
    const context = buildProductContext(product)
    if (mode === 'vision') {
      api.generateVisionRefinement(context).then(setDraft).then(() => setStatus('ready')).catch(handleError)
    } else {
      api
        .generateKpiSuggestions(context)
        .then((result) => {
          setSuggestions(result)
          setStatus('ready')
        })
        .catch(handleError)
    }
  }

  // Chargement au montage uniquement — un changement de mode ouvre une
  // nouvelle instance de la modale (voir ProductsScreen.tsx, la clé React
  // qui inclut le mode force un remontage), tableau de dépendances
  // volontairement vide, même patron que PainPointSolutionsModal.tsx.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(fetchDraft, [])

  function addDifferentiator() {
    const text = newDifferentiator.trim()
    if (!text || !draft) return
    setDraft({ ...draft, differentiators: [...draft.differentiators, text] })
    setNewDifferentiator('')
  }
  function removeDifferentiator(index: number) {
    if (!draft) return
    setDraft({ ...draft, differentiators: draft.differentiators.filter((_, i) => i !== index) })
  }
  function addPillar() {
    const text = newPillar.trim()
    if (!text || !draft) return
    setDraft({ ...draft, pillars: [...draft.pillars, text] })
    setNewPillar('')
  }
  function removePillar(index: number) {
    if (!draft) return
    setDraft({ ...draft, pillars: draft.pillars.filter((_, i) => i !== index) })
  }

  function applyVision() {
    if (!draft) return
    onChange({ ...product, visionStatement: draft.visionStatement, differentiators: draft.differentiators, pillars: draft.pillars })
    onClose()
  }

  function acceptKpi(suggestion: DraftKpiSuggestion) {
    const key = suggestion.name.trim().toLowerCase()
    const alreadyExists = product.kpis.some((k) => k.name.trim().toLowerCase() === key)
    if (alreadyExists || addedNames.has(key)) return
    const kpi: ProductKpi = {
      id: newId('kpi'),
      name: suggestion.name,
      definition: suggestion.definition,
      unit: suggestion.unit,
      baseline: suggestion.baseline,
      target: suggestion.target,
      pillar: suggestion.pillar,
    }
    onChange({ ...product, kpis: [...product.kpis, kpi] })
    setAddedNames((prev) => new Set(prev).add(key))
  }

  const title = mode === 'vision' ? 'Affiner la vision avec l’IA' : 'Suggestions de KPI par l’IA'

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal vision-refinement-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        </header>

        {status === 'not-configured' && (
          <div className="nl-warning">
            Génération indisponible : aucune clé API n'est configurée. Ouvrez <strong>Paramètres</strong> en bas de
            la barre latérale pour en saisir une.
          </div>
        )}
        {status === 'rate-limited' && (
          <div className="nl-warning">
            Le fournisseur LLM limite temporairement le nombre d'appels (429) — réessayez dans quelques instants, ou
            changez de fournisseur depuis <strong>Paramètres</strong> si cela persiste.
          </div>
        )}
        {error && <p className="error">{error}</p>}
        {status === 'loading' && (
          <p className="loading-row">
            <Spinner /> {mode === 'vision' ? 'Affinage de la vision…' : 'Génération des suggestions de KPI…'}
          </p>
        )}

        {status === 'ready' && mode === 'vision' && draft && (
          <>
            <section className="actor-mission-section">
              <h3>Vision</h3>
              <textarea
                rows={3}
                value={draft.visionStatement}
                onChange={(e) => setDraft({ ...draft, visionStatement: e.target.value })}
              />
            </section>
            <section className="actor-mission-section">
              <h3>Différenciateurs</h3>
              {draft.differentiators.length === 0 ? (
                <p className="placeholder">Aucun différenciateur proposé.</p>
              ) : (
                <ul className="item-list">
                  {draft.differentiators.map((d, i) => (
                    <li key={i}>
                      <span>{d}</span>
                      <button type="button" onClick={() => removeDifferentiator(i)}>
                        retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="add-item-row">
                <input
                  placeholder="Nouveau différenciateur"
                  value={newDifferentiator}
                  onChange={(e) => setNewDifferentiator(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addDifferentiator()}
                />
                <button type="button" onClick={addDifferentiator}>
                  Ajouter
                </button>
              </div>
            </section>
            <section className="actor-mission-section">
              <h3>Piliers stratégiques</h3>
              {draft.pillars.length === 0 ? (
                <p className="placeholder">Aucun pilier proposé.</p>
              ) : (
                <ul className="item-list">
                  {draft.pillars.map((pillar, i) => (
                    <li key={i}>
                      <span>{pillar}</span>
                      <button type="button" onClick={() => removePillar(i)}>
                        retirer
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="add-item-row">
                <input
                  placeholder="Nouveau pilier"
                  value={newPillar}
                  onChange={(e) => setNewPillar(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addPillar()}
                />
                <button type="button" onClick={addPillar}>
                  Ajouter
                </button>
              </div>
            </section>
            <div className="nl-actions">
              <button type="button" className="btn-primary" onClick={applyVision}>
                Appliquer au brouillon
              </button>
              <button type="button" onClick={fetchDraft}>
                Régénérer
              </button>
            </div>
          </>
        )}

        {status === 'ready' && mode === 'kpis' && (
          <>
            {suggestions.length === 0 ? (
              <p className="actor-warning">Aucun KPI proposé.</p>
            ) : (
              <ul className="painpoint-solutions-list">
                {suggestions.map((s, i) => {
                  const key = s.name.trim().toLowerCase()
                  const alreadyExists = product.kpis.some((k) => k.name.trim().toLowerCase() === key)
                  const added = addedNames.has(key)
                  return (
                    <li key={i} className="painpoint-solution-card">
                      <strong>{s.name}</strong>
                      {s.pillar && <span className="nl-hint"> — {s.pillar}</span>}
                      {s.definition && <p>{s.definition}</p>}
                      {s.unit && <p className="nl-hint">Unité : {s.unit}</p>}
                      <button
                        type="button"
                        className="btn-primary"
                        onClick={() => acceptKpi(s)}
                        disabled={alreadyExists || added}
                      >
                        {alreadyExists || added ? 'Ajouté' : 'Ajouter au produit'}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="nl-actions">
              <button type="button" onClick={fetchDraft}>
                Régénérer
              </button>
              <button type="button" className="btn-primary" onClick={onClose}>
                Fermer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
