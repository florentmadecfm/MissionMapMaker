import { useEffect, useRef, useState } from 'react'

interface Props {
  children: React.ReactNode
}

// Menu "burger" générique : un bouton déclencheur (☰) et un menu déroulant
// qui se ferme au clic sur un item (ou en dehors). Regroupe les actions
// fichier (export/import) hors de la barre d'en-tête pour ne pas la
// surcharger à mesure que de nouvelles actions s'y ajoutent.
export function HeaderMenu({ children }: Props) {
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
        className="header-menu-trigger"
        onClick={() => setOpen((v) => !v)}
        aria-label="Menu"
        title="Menu"
      >
        ☰
      </button>
      {open && (
        <div className="header-menu-dropdown" onClick={() => setOpen(false)}>
          {children}
        </div>
      )}
    </div>
  )
}
