import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { Product, ProductKpi, ProjectSummary } from '../../api/types'

interface Props {
  // Tenu à jour par ProjectShell.tsx (rafraîchi après chaque création/
  // sauvegarde/suppression de produit) — même patron que `actors` pour
  // ActorMissionsScreen.tsx (ADR-041/046). null tant que le premier
  // chargement n'a pas répondu.
  products: Product[] | null
  error: string | null
  onProductsChanged: () => void
  // Missions déjà connues du shell (résumés), pour lister celles
  // rattachées au produit sélectionné sans requête dédiée.
  missions: ProjectSummary[]
  onOpenMission: (projectId: string) => void
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function emptyKpi(): ProductKpi {
  return { id: newId('kpi'), name: '' }
}

// Écran indépendant de tout projet ouvert (voir ProjectShell.tsx, état
// `view`) : liste les Produits (liste à gauche, détail à droite — même
// patron master-detail que ActorMissionsScreen.tsx), pour définir vision/
// différenciateurs/piliers stratégiques/KPI. Sauvegarde EXPLICITE (bouton
// "Enregistrer"), pas l'autosave débouncée du reste de l'app : un Produit
// vit dans un magasin séparé (storage.ProductStore) sans lien avec la
// mécanique d'autosave d'une mission, et un moment explicite "j'ai fini
// d'éditer" convient bien à un flux de rédaction assistée par IA (voir
// VisionRefinementModal.tsx, Phase 2).
export function ProductsScreen({ products, error, onProductsChanged, missions, onOpenMission }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Product | null>(null)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [newDifferentiator, setNewDifferentiator] = useState('')
  const [newPillar, setNewPillar] = useState('')

  useEffect(() => {
    if (!products) return
    setSelectedId((current) => (current && products.some((p) => p.id === current) ? current : products[0]?.id ?? null))
  }, [products])

  // Le brouillon local se resynchronise avec le produit sélectionné à
  // chaque rafraîchissement de `products` (ex. juste après la création
  // d'un produit — sa sélection peut précéder l'arrivée de la liste
  // rafraîchie, voir handleCreate — ou après Enregistrer, voir
  // handleSave) : sans ça, le brouillon resterait vide/périmé tant que
  // `selectedId` lui-même ne change pas. En revanche, savedAt/saveError
  // ne sont réinitialisés QUE quand la SÉLECTION elle-même change (suivi
  // via ce ref) — pas à chaque rafraîchissement de `products` — sans quoi
  // le rafraîchissement déclenché par handleSave lui-même effacerait le
  // message "Enregistré à ..." qu'il vient tout juste d'afficher.
  const lastSelectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    const selected = products?.find((p) => p.id === selectedId) ?? null
    setDraft(selected)
    if (lastSelectedIdRef.current !== selectedId) {
      lastSelectedIdRef.current = selectedId
      setSaveError(null)
      setSavedAt(null)
    }
  }, [selectedId, products])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const created = await api.createProduct(newName.trim())
      setNewName('')
      onProductsChanged()
      setSelectedId(created.id)
    } catch (e) {
      setCreateError(String(e))
    } finally {
      setCreating(false)
    }
  }

  async function handleSave() {
    if (!draft) return
    setSaving(true)
    setSaveError(null)
    try {
      const saved = await api.saveProduct(draft)
      setDraft(saved)
      setSavedAt(new Date().toLocaleTimeString())
      onProductsChanged()
    } catch (e) {
      setSaveError(String(e))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Supprimer définitivement le produit « ${name} » ? Cette action est irréversible.`)) return
    try {
      await api.deleteProduct(id)
      if (selectedId === id) setSelectedId(null)
      onProductsChanged()
    } catch (e) {
      setSaveError(String(e))
    }
  }

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

  function addKpi() {
    if (!draft) return
    setDraft({ ...draft, kpis: [...draft.kpis, emptyKpi()] })
  }

  function updateKpi(id: string, patch: Partial<ProductKpi>) {
    if (!draft) return
    setDraft({ ...draft, kpis: draft.kpis.map((k) => (k.id === id ? { ...k, ...patch } : k)) })
  }

  function removeKpi(id: string) {
    if (!draft) return
    setDraft({ ...draft, kpis: draft.kpis.filter((k) => k.id !== id) })
  }

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!products) {
    return <p>Chargement…</p>
  }

  const linkedMissions = draft ? missions.filter((m) => m.productId === draft.id) : []

  return (
    <div className="actor-missions-screen products-screen">
      <aside className="actor-missions-list">
        <div className="new-project">
          <input
            placeholder="Nom du nouveau produit"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
        {createError && <p className="error">{createError}</p>}

        {products.length === 0 && <p className="placeholder">Aucun produit pour l'instant.</p>}
        {products.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`actor-missions-list-item${p.id === selectedId ? ' active' : ''}`}
            onClick={() => setSelectedId(p.id)}
          >
            <span className="actor-missions-list-name">{p.name}</span>
          </button>
        ))}
      </aside>

      <div className="actor-missions-detail">
        {draft && (
          <>
            <div className="actor-missions-header">
              <h2 className="panel-title">{draft.name}</h2>
              <button type="button" className="danger" onClick={() => handleDelete(draft.id, draft.name)}>
                Supprimer
              </button>
            </div>

            <section className="actor-mission-section">
              <h3>Vision</h3>
              <textarea
                rows={3}
                placeholder="Ex. Pour les Product Owners et Designers qui veulent ancrer leurs missions dans une vision produit claire, Pulse.MissionMap est l'outil de story mapping qui relie chaque activité du diagramme à un KPI mesurable — contrairement aux outils de mapping génériques, sans lien avec la stratégie produit."
                value={draft.visionStatement ?? ''}
                onChange={(e) => setDraft({ ...draft, visionStatement: e.target.value })}
              />
            </section>

            <section className="actor-mission-section">
              <h3>Différenciateurs</h3>
              {draft.differentiators.length === 0 ? (
                <p className="placeholder">Aucun différenciateur pour l'instant.</p>
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
                <p className="placeholder">Aucun pilier pour l'instant.</p>
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

            <section className="actor-mission-section">
              <h3>KPI</h3>
              {draft.kpis.length === 0 ? (
                <p className="placeholder">Aucun KPI pour l'instant.</p>
              ) : (
                <table className="product-kpi-table">
                  <thead>
                    <tr>
                      <th>Nom</th>
                      <th>Définition</th>
                      <th>Unité</th>
                      <th>Actuel</th>
                      <th>Cible</th>
                      <th>Pilier</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {draft.kpis.map((kpi) => (
                      <tr key={kpi.id}>
                        <td>
                          <input value={kpi.name} onChange={(e) => updateKpi(kpi.id, { name: e.target.value })} />
                        </td>
                        <td>
                          <input
                            value={kpi.definition ?? ''}
                            onChange={(e) => updateKpi(kpi.id, { definition: e.target.value })}
                          />
                        </td>
                        <td>
                          <input value={kpi.unit ?? ''} onChange={(e) => updateKpi(kpi.id, { unit: e.target.value })} />
                        </td>
                        <td>
                          <input
                            value={kpi.baseline ?? ''}
                            onChange={(e) => updateKpi(kpi.id, { baseline: e.target.value })}
                          />
                        </td>
                        <td>
                          <input value={kpi.target ?? ''} onChange={(e) => updateKpi(kpi.id, { target: e.target.value })} />
                        </td>
                        <td>
                          <select value={kpi.pillar ?? ''} onChange={(e) => updateKpi(kpi.id, { pillar: e.target.value })}>
                            <option value="">—</option>
                            {draft.pillars.map((pillar) => (
                              <option key={pillar} value={pillar}>
                                {pillar}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <button type="button" className="danger" onClick={() => removeKpi(kpi.id)}>
                            retirer
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <button type="button" onClick={addKpi}>
                + Ajouter un KPI
              </button>
            </section>

            <section className="actor-mission-section">
              <h3>Missions rattachées</h3>
              {linkedMissions.length === 0 ? (
                <p className="placeholder">Aucune mission rattachée à ce produit pour l'instant.</p>
              ) : (
                <ul className="item-list">
                  {linkedMissions.map((m) => (
                    <li key={m.id}>
                      <span>{m.name}</span>
                      <button type="button" onClick={() => onOpenMission(m.id)}>
                        Ouvrir cette mission
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <div className="products-save-row">
              <button type="button" className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {savedAt && <span className="autosave-status">Enregistré à {savedAt}</span>}
              {saveError && <span className="error">{saveError}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
