import { useEffect, useRef, useState } from 'react'
import { api } from '../../api/client'
import type { Product, ProductKpi, ProjectSummary } from '../../api/types'
import { buildKpiTree, excludeSelfAndDescendants } from './kpiTree'
import { KpiTreeDiagram } from './KpiTreeDiagram'
import { VisionRefinementModal } from './VisionRefinementModal'

interface Props {
  // Tenu à jour par ProjectShell.tsx (rafraîchi après chaque création/
  // sauvegarde/suppression de produit) — même patron que `actors` pour
  // ActorMissionsScreen.tsx (ADR-041/046). null tant que le premier
  // chargement n'a pas répondu.
  products: Product[] | null
  error: string | null
  onProductsChanged: () => void
  // Missions déjà connues du shell (résumés), pour lister celles
  // rattachées au produit sélectionné sans requête dédiée, et proposer
  // d'en lier de nouvelles (voir handleLinkMission).
  missions: ProjectSummary[]
  onOpenMission: (projectId: string) => void
  // Rafraîchit `missions` (ProjectShell.refreshList) après avoir lié une
  // mission à ce produit — distinct de onProductsChanged, qui ne
  // recharge que les produits.
  onMissionsChanged: () => void
}

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

function emptyKpi(): ProductKpi {
  return { id: newId('kpi'), name: '' }
}

// Écran indépendant de tout projet ouvert (voir ProjectShell.tsx, état
// `view`) : un produit à la fois (sélectionné depuis un dropdown en
// en-tête, pas une liste master-detail — retour utilisateur : la liste
// prenait une colonne entière pour peu d'usage), pour définir vision/
// différenciateurs/piliers stratégiques/KPI. Sauvegarde EXPLICITE (bouton
// "Enregistrer"), pas l'autosave débouncée du reste de l'app : un Produit
// vit dans un magasin séparé (storage.ProductStore) sans lien avec la
// mécanique d'autosave d'une mission, et un moment explicite "j'ai fini
// d'éditer" convient bien à un flux de rédaction assistée par IA (voir
// VisionRefinementModal.tsx, Phase 2).
export function ProductsScreen({ products, error, onProductsChanged, missions, onOpenMission, onMissionsChanged }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<Product | null>(null)
  const [newName, setNewName] = useState('')
  const [creatingOpen, setCreatingOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [newDifferentiator, setNewDifferentiator] = useState('')
  const [newPillar, setNewPillar] = useState('')
  // Phase 2 du plan Produit/Vision/KPI : mode de la modale de génération
  // assistée actuellement ouverte, ou null si fermée — voir
  // VisionRefinementModal.tsx (2 modes dans le même composant).
  const [aiModalMode, setAiModalMode] = useState<'vision' | 'kpis' | null>(null)
  // Liaison d'une mission déjà existante à ce produit — voir
  // handleLinkMission ci-dessous.
  const [linkTargetId, setLinkTargetId] = useState('')
  const [linking, setLinking] = useState(false)
  const [linkError, setLinkError] = useState<string | null>(null)
  // Id du KPI brièvement mis en surbrillance après un clic dans
  // KpiTreeDiagram.tsx (voir handleSelectKpi) — retiré après un court
  // délai, pas un état de sélection persistant.
  const [highlightedKpiId, setHighlightedKpiId] = useState<string | null>(null)
  // Bascule Configuration/Graphe de la section KPI (retour utilisateur :
  // un onglet dédié plutôt que le graphe affiché en permanence au-dessus
  // des cartes) — 'config' par défaut, l'édition reste le cas d'usage
  // principal. TOUR_STEPS[1] (tourSteps.ts) cible '.product-kpi-table',
  // rendu seulement en vue 'config' : la valeur par défaut doit rester
  // 'config' pour que cette étape de la visite guidée continue de trouver
  // sa cible sans changement de sa part.
  const [kpiView, setKpiView] = useState<'config' | 'graph'>('config')

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
      setCreatingOpen(false)
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

  // Réattache les éventuels sous-KPI du nœud supprimé au parent DE CE
  // NŒUD (pas au premier niveau) avant de le retirer — sans cette
  // réattache, supprimer un KPI parent laisserait ses enfants avec un
  // parentId pendant (référençant un KPI qui n'existe plus), rejeté par
  // Product.Validate() côté serveur dès le prochain "Enregistrer".
  function removeKpi(id: string) {
    if (!draft) return
    const deleted = draft.kpis.find((k) => k.id === id)
    const reparented = draft.kpis.map((k) => (k.parentId === id ? { ...k, parentId: deleted?.parentId } : k))
    setDraft({ ...draft, kpis: reparented.filter((k) => k.id !== id) })
  }

  // Relie la visualisation d'ensemble (KpiTreeDiagram.tsx, vue 'graph') au
  // formulaire d'édition (vue 'config') : un clic sur un nœud de l'arbre
  // bascule vers Configuration puis fait défiler jusqu'à sa carte
  // (id="kpi-card-{id}" posé sur chaque carte ci-dessous) et la met
  // brièvement en surbrillance (.kpi-card-highlighted, App.css) pour que
  // l'utilisateur retrouve immédiatement où éditer ce KPI. Les cartes ne
  // sont pas montées tant que la vue reste 'graph' (rendu conditionnel
  // ci-dessous) : requestAnimationFrame attend que le changement de vue
  // soit commité au DOM avant de chercher la carte, sans quoi elle
  // n'existerait pas encore au moment du scroll.
  function handleSelectKpi(kpiId: string) {
    setKpiView('config')
    requestAnimationFrame(() => {
      document.getElementById(`kpi-card-${kpiId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setHighlightedKpiId(kpiId)
      window.setTimeout(() => {
        setHighlightedKpiId((current) => (current === kpiId ? null : current))
      }, 1200)
    })
  }

  // Lie une mission DÉJÀ EXISTANTE à ce produit, depuis l'écran Produits
  // (sens inverse du sélecteur "Produit associé" de ProjectEditor.tsx,
  // qui reste l'unique façon de faire ce lien jusqu'ici). Pas d'endpoint
  // PATCH dédié : même aller-retour complet get/save que ProjectEditor
  // utilise déjà via son autosave (aucune nouvelle route API).
  async function handleLinkMission() {
    if (!linkTargetId || !draft) return
    setLinking(true)
    setLinkError(null)
    try {
      const project = await api.getProject(linkTargetId)
      await api.saveProject({ ...project, productId: draft.id })
      setLinkTargetId('')
      onMissionsChanged()
    } catch (e) {
      setLinkError(String(e))
    } finally {
      setLinking(false)
    }
  }

  if (error) {
    return <p className="error">{error}</p>
  }
  if (!products) {
    return <p>Chargement…</p>
  }

  const linkedMissions = draft ? missions.filter((m) => m.productId === draft.id) : []
  // Missions proposées au lien : TOUTES sauf celles déjà liées à CE
  // produit — y compris celles déjà liées à un AUTRE produit (réassigner
  // depuis ici est un geste déjà possible depuis ProjectEditor.tsx, pas
  // de raison de le masquer ici).
  const linkableMissions = draft ? missions.filter((m) => m.productId !== draft.id) : []

  return (
    <div className="products-screen">
      <div className="products-header">
        <select
          className="products-select"
          value={selectedId ?? ''}
          onChange={(e) => setSelectedId(e.target.value || null)}
          disabled={products.length === 0}
        >
          {products.length === 0 ? (
            <option value="">— aucun produit —</option>
          ) : (
            products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))
          )}
        </select>
        <button type="button" onClick={() => setCreatingOpen((v) => !v)}>
          + Nouveau produit
        </button>
      </div>
      {creatingOpen && (
        <div className="new-product">
          <input
            autoFocus
            placeholder="Nom du nouveau produit"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button type="button" className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? 'Création…' : 'Créer'}
          </button>
        </div>
      )}
      {createError && <p className="error">{createError}</p>}
      {products.length === 0 && <p className="placeholder">Aucun produit pour l'instant — créez-en un.</p>}

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
            <div className="nl-actions">
              <button type="button" onClick={() => setAiModalMode('vision')}>
                Affiner avec l'IA
              </button>
            </div>
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
            <div className="kpi-section-header">
              <h3>KPI</h3>
              <div className="variant-toggle kpi-view-toggle" role="radiogroup" aria-label="Vue des KPI">
                <button
                  type="button"
                  role="radio"
                  aria-checked={kpiView === 'config'}
                  className={`variant-toggle-option${kpiView === 'config' ? ' active' : ''}`}
                  onClick={() => setKpiView('config')}
                >
                  <span className="variant-toggle-dot" aria-hidden="true" />
                  Configuration
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={kpiView === 'graph'}
                  className={`variant-toggle-option${kpiView === 'graph' ? ' active' : ''}`}
                  onClick={() => setKpiView('graph')}
                >
                  <span className="variant-toggle-dot" aria-hidden="true" />
                  Graphe
                </button>
              </div>
            </div>

            {kpiView === 'graph' ? (
              draft.kpis.length === 0 ? (
                <p className="placeholder">Aucun KPI pour l'instant.</p>
              ) : (
                <KpiTreeDiagram kpis={draft.kpis} onSelectKpi={handleSelectKpi} />
              )
            ) : draft.kpis.length === 0 ? (
              <p className="placeholder">Aucun KPI pour l'instant.</p>
            ) : (
              <div className="product-kpi-table">
                {/* Rendu en profondeur (buildKpiTree) plutôt que dans
                    l'ordre brut de la liste : un sous-KPI apparaît juste
                    après son parent, indenté (voir --kpi-depth,
                    App.css). Une carte par KPI (retour utilisateur :
                    l'ancien tableau à 8 colonnes était trop dense) sur 3
                    lignes visibles — nom, définition, puis unité/actuel/
                    cible — plus une ligne compacte pour la hiérarchie/le
                    pilier/la suppression. id + surbrillance conditionnelle :
                    cible du clic sur un nœud de KpiTreeDiagram.tsx (voir
                    handleSelectKpi). */}
                {buildKpiTree(draft.kpis).map(({ kpi, depth }) => (
                  <div
                    id={`kpi-card-${kpi.id}`}
                    className={`product-kpi-card${kpi.id === highlightedKpiId ? ' kpi-card-highlighted' : ''}`}
                    key={kpi.id}
                  >
                    <input
                      className="product-kpi-name-input"
                      style={{ ['--kpi-depth' as string]: depth }}
                      placeholder="Nom du KPI"
                      value={kpi.name}
                      onChange={(e) => updateKpi(kpi.id, { name: e.target.value })}
                    />
                    <input
                      placeholder="Définition"
                      value={kpi.definition ?? ''}
                      onChange={(e) => updateKpi(kpi.id, { definition: e.target.value })}
                    />
                    <div className="product-kpi-metrics-row">
                      <label className="product-kpi-metric">
                        <span>Unité</span>
                        <input value={kpi.unit ?? ''} onChange={(e) => updateKpi(kpi.id, { unit: e.target.value })} />
                      </label>
                      <label className="product-kpi-metric">
                        <span>Actuel</span>
                        <input
                          value={kpi.baseline ?? ''}
                          onChange={(e) => updateKpi(kpi.id, { baseline: e.target.value })}
                        />
                      </label>
                      <label className="product-kpi-metric">
                        <span>Cible</span>
                        <input value={kpi.target ?? ''} onChange={(e) => updateKpi(kpi.id, { target: e.target.value })} />
                      </label>
                    </div>
                    <div className="product-kpi-meta-row">
                      <select
                        value={kpi.parentId ?? ''}
                        onChange={(e) => updateKpi(kpi.id, { parentId: e.target.value || undefined })}
                      >
                        <option value="">Sous-KPI de : — (premier niveau)</option>
                        {excludeSelfAndDescendants(draft.kpis, kpi.id).map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            Sous-KPI de : {candidate.name || '(sans nom)'}
                          </option>
                        ))}
                      </select>
                      <select value={kpi.pillar ?? ''} onChange={(e) => updateKpi(kpi.id, { pillar: e.target.value })}>
                        <option value="">Pilier : —</option>
                        {draft.pillars.map((pillar) => (
                          <option key={pillar} value={pillar}>
                            Pilier : {pillar}
                          </option>
                        ))}
                      </select>
                      <button type="button" className="danger" onClick={() => removeKpi(kpi.id)}>
                        retirer
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="nl-actions">
              <button type="button" onClick={addKpi}>
                + Ajouter un KPI
              </button>
              <button type="button" onClick={() => setAiModalMode('kpis')}>
                Suggérer des KPI (IA)
              </button>
            </div>
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
            {linkableMissions.length > 0 && (
              <div className="add-item-row">
                <select value={linkTargetId} onChange={(e) => setLinkTargetId(e.target.value)}>
                  <option value="">Lier une mission…</option>
                  {linkableMissions.map((m) => {
                    const otherProductName = m.productId ? products.find((p) => p.id === m.productId)?.name : undefined
                    return (
                      <option key={m.id} value={m.id}>
                        {m.name}
                        {otherProductName ? ` — déjà liée à « ${otherProductName} »` : ''}
                      </option>
                    )
                  })}
                </select>
                <button type="button" onClick={handleLinkMission} disabled={!linkTargetId || linking}>
                  {linking ? 'Liaison…' : 'Lier'}
                </button>
              </div>
            )}
            {linkError && <p className="error">{linkError}</p>}
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

      {aiModalMode && draft && (
        <VisionRefinementModal
          key={aiModalMode}
          product={draft}
          mode={aiModalMode}
          onChange={setDraft}
          onClose={() => setAiModalMode(null)}
        />
      )}
    </div>
  )
}
