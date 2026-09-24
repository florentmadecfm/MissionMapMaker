import { useEffect, useRef, useState } from 'react'
import { Menu } from 'lucide-react'

interface Props {
  children: React.ReactNode
  // Contenu du bouton déclencheur — l'icône ☰ générique par défaut (menu
  // burger d'actions fichier), ou un déclencheur propre à l'appelant (ex.
  // "Exporter en PNG ▾", voir DownloadPngButton dans ProcessDiagram.tsx)
  // quand ce composant sert à un menu déroulant plus spécifique.
  trigger?: React.ReactNode
  triggerClassName?: string
  triggerLabel?: string
  // Classe du panneau déroulant — 'header-menu-dropdown' par défaut,
  // ancré sous le déclencheur (voir App.css). Distincte pour le menu
  // Paramètres/visite guidée de la sidebar (ProjectShell.tsx,
  // 'sidebar-menu-dropdown') : ce déclencheur vit tout en bas de la
  // colonne, un panneau qui s'ouvrirait vers le bas déborderait hors de
  // l'écran — la classe alternative s'ancre au-dessus à la place.
  dropdownClassName?: string
}

// Menu déroulant générique : un bouton déclencheur et un menu qui se
// ferme au clic sur un item (ou en dehors). Utilisé tel quel (icône ☰)
// pour regrouper les actions fichier (export/import) hors de la barre
// d'en-tête, et avec un déclencheur personnalisé pour tout autre menu
// déroulant simple de l'app plutôt que de dupliquer cette logique
// d'ouverture/fermeture.
export function HeaderMenu({ children, trigger, triggerClassName, triggerLabel, dropdownClassName }: Props) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  return (
    <div className="header-menu" ref={ref}>
      <button
        type="button"
        className={triggerClassName ?? 'header-menu-trigger'}
        onClick={() => setOpen((v) => !v)}
        aria-label={triggerLabel ?? 'Menu'}
        title={trigger ? undefined : 'Menu'}
      >
        {trigger ?? <Menu size={18} aria-hidden="true" />}
      </button>
      {open && (
        <div className={dropdownClassName ?? 'header-menu-dropdown'} onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
