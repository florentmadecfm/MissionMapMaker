import { useState } from 'react'
import type { Product } from '../../api/types'
import { buildKpiTree } from './kpiTree'

interface Props {
  // undefined = aucun produit associé à la mission (Project.productId) —
  // état explicite plutôt qu'une section vide/masquée sans explication.
  product: Product | undefined
  linkedIds: string[]
  onChange: (ids: string[]) => void
}

// Section "KPI liés" partagée par ActivityDetailModal.tsx et
// PhaseDetailModal.tsx (Phase 3 du plan Produit/Vision/KPI) — plus simple
// que la section "Points de friction" dont elle s'inspire (liste à puces +
// bouton retirer) : pas de création libre, seulement une sélection dans
// l'arbre déjà existant du produit lié.
export function KpiLinksSection({ product, linkedIds, onChange }: Props) {
  const [selectedId, setSelectedId] = useState('')

  if (!product) {
    return (
      <section className="actor-mission-section">
        <h3>KPI liés</h3>
        <p className="placeholder">
          Aucun produit associé à cette mission — associez-en un depuis l'onglet Édition pour lier des KPI.
        </p>
      </section>
    )
  }

  const availableKpis = buildKpiTree(product.kpis).filter(({ kpi }) => !linkedIds.includes(kpi.id))

  function addLink() {
    if (!selectedId || linkedIds.includes(selectedId)) return
    onChange([...linkedIds, selectedId])
    setSelectedId('')
  }

  function removeLink(id: string) {
    onChange(linkedIds.filter((linkedId) => linkedId !== id))
  }

  return (
    <section className="actor-mission-section">
      <h3>KPI liés</h3>
      {linkedIds.length === 0 ? (
        <p className="placeholder">Aucun KPI lié pour l'instant.</p>
      ) : (
        <ul className="item-list">
          {linkedIds.map((id) => {
            // Un id qui ne correspond plus à aucun KPI du produit (supprimé
            // entretemps depuis l'écran Produits) reste affiché
            // explicitement plutôt que de disparaître silencieusement —
            // seule action possible : le retirer.
            const kpi = product.kpis.find((k) => k.id === id)
            return (
              <li key={id}>
                <span>{kpi ? kpi.name : '(KPI supprimé)'}</span>
                <button type="button" onClick={() => removeLink(id)}>
                  retirer
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {availableKpis.length > 0 && (
        <div className="add-item-row">
          <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            <option value="">Lier un KPI…</option>
            {availableKpis.map(({ kpi, depth }) => (
              <option key={kpi.id} value={kpi.id}>
                {'— '.repeat(depth)}
                {kpi.name || '(sans nom)'}
              </option>
            ))}
          </select>
          <button type="button" onClick={addLink} disabled={!selectedId}>
            Ajouter
          </button>
        </div>
      )}
    </section>
  )
}
