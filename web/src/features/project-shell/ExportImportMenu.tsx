import { useRef, useState } from 'react'
import type { Product, Project } from '../../api/types'
import { exportProjectToExcel } from './exportExcel'
import { HeaderMenu } from './HeaderMenu'
import { importProjectFromExcel } from './importExcel'

interface Props {
  project: Project
  // Produit associé à cette mission (ou null) — voir exportExcel.ts/
  // importExcel.ts : l'export inclut vision/différenciateurs/piliers/KPI
  // du produit, l'import résout la colonne "KPI liés" vers ces KPI. Le
  // produit lui-même n'est ni exporté-modifiable ni ré-importé — seul son
  // contenu ACTUEL sert de référence en lecture seule (voir Autres
  // missions liées ci-dessous, un produit pouvant être lié à plusieurs
  // missions : l'Excel de l'une ne doit pas pouvoir modifier le produit
  // partagé par les autres).
  product: Product | null
  linkedMissionNames: string[]
  onChange: (project: Project) => void
  onShowHistory: () => void
}

// Menu burger des actions sur le projet ouvert — export/import Excel et
// historique des versions — placé au niveau de la barre d'onglets
// (ProjectShell.tsx) plutôt que dans l'en-tête d'un seul onglet (Édition,
// avant ADR-046) : disponible depuis n'importe quel onglet, pas seulement
// quand on y est déjà. La création de la cible d'une mission n'est plus
// ici : voir VariantToggle, affiché en permanence au-dessus des onglets.
export function ExportImportMenu({ project, product, linkedMissionNames, onChange, onShowHistory }: Props) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportProjectToExcel(project, product, linkedMissionNames)
    } catch (e) {
      setExportError(String(e))
    } finally {
      setExporting(false)
    }
  }

  // Remplace les 6 collections du projet OUVERT par le contenu du fichier,
  // y compris les liens KPI des activités/phases résolus contre le
  // produit ACTUELLEMENT associé (voir importExcel.ts — le produit
  // lui-même n'est jamais modifié ni réassigné par cet import). Comme
  // toute autre modification, remonte par onChange et sera sauvegardé
  // automatiquement (voir ProjectShell.tsx) — mais la confirmation reste
  // nécessaire, l'opération étant un remplacement complet plutôt qu'un
  // ajout (contrairement à la fusion additive des ébauches générées par LLM).
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de resélectionner le même fichier après un échec
    if (!file) return
    if (
      !window.confirm(
        "Importer ce fichier Excel va remplacer les personas, phases, activités, interactions, spécifications, tests et liens KPI du projet ouvert (sauvegardé automatiquement juste après). Continuer ?",
      )
    ) {
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      onChange(await importProjectFromExcel(file, project, product))
    } catch (err) {
      setImportError(String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="export-import-menu">
      <HeaderMenu>
        <button type="button" onClick={handleExport} disabled={exporting}>
          {exporting ? 'Export…' : 'Exporter en Excel'}
        </button>
        <button type="button" onClick={() => importFileRef.current?.click()} disabled={importing}>
          {importing ? 'Import…' : 'Importer depuis Excel'}
        </button>
        <button type="button" onClick={onShowHistory}>
          Historique des versions…
        </button>
      </HeaderMenu>
      <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={handleImportFile} />
      {exportError && <span className="error">Export Excel : {exportError}</span>}
      {importError && <span className="error">Import Excel : {importError}</span>}
    </div>
  )
}
