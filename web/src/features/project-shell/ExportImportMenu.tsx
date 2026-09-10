import { useRef, useState } from 'react'
import type { Project } from '../../api/types'
import { exportProjectToExcel } from './exportExcel'
import { HeaderMenu } from './HeaderMenu'
import { importProjectFromExcel } from './importExcel'

interface Props {
  project: Project
  onChange: (project: Project) => void
}

// Menu burger export/import Excel du projet ouvert — placé au niveau de la
// barre d'onglets (ProjectShell.tsx) plutôt que dans l'en-tête d'un seul
// onglet (Édition, avant ADR-046) : disponible depuis n'importe quel
// onglet, pas seulement quand on y est déjà.
export function ExportImportMenu({ project, onChange }: Props) {
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const importFileRef = useRef<HTMLInputElement>(null)

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await exportProjectToExcel(project)
    } catch (e) {
      setExportError(String(e))
    } finally {
      setExporting(false)
    }
  }

  // Remplace les 6 collections du projet OUVERT par le contenu du fichier
  // (voir importExcel.ts) : comme toute autre modification, ce n'est
  // qu'un nouvel état local tant que "Sauvegarder" n'a pas été cliqué —
  // mais la confirmation reste nécessaire, l'opération étant un
  // remplacement complet plutôt qu'un ajout (contrairement à la fusion
  // additive des ébauches générées par LLM).
  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // permet de resélectionner le même fichier après un échec
    if (!file) return
    if (
      !window.confirm(
        "Importer ce fichier Excel va remplacer les acteurs, phases, activités, interactions, spécifications et tests du projet ouvert (à sauvegarder ensuite pour confirmer). Continuer ?",
      )
    ) {
      return
    }
    setImporting(true)
    setImportError(null)
    try {
      onChange(await importProjectFromExcel(file, project))
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
      </HeaderMenu>
      <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={handleImportFile} />
      {exportError && <span className="error">Export Excel : {exportError}</span>}
      {importError && <span className="error">Import Excel : {importError}</span>}
    </div>
  )
}
