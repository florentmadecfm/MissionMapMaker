import type { TextContent, TextItem } from 'pdfjs-dist/types/src/display/api'

export interface PositionedItem {
  str: string
  x: number
  y: number
  width: number
  height: number
}

// pdf.js restitue les fragments de texte dans l'ordre du FLUX du contenu
// PDF, pas dans l'ordre de lecture visuel : un document à 2 colonnes ou un
// tableau ressort souvent entrelacé si on se contente de concaténer
// `item.str` tel quel (ancien comportement de pdfText.ts). `item.transform`
// porte la position réelle de chaque fragment (x = transform[4], y =
// transform[5], repère PDF : origine en bas à gauche, Y croissant vers le
// haut) — on l'utilise pour regrouper par ligne puis trier par colonne,
// avant de détecter les tableaux (voir reconstructPageText ci-dessous).
export function extractPositionedItems(content: TextContent): PositionedItem[] {
  const result: PositionedItem[] = []
  for (const raw of content.items) {
    if (!('str' in raw)) continue // TextMarkedContent, pas un fragment de texte
    const item = raw as TextItem
    if (item.str.length === 0) continue
    result.push({
      str: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
      height: item.height,
    })
  }
  return result
}

// Regroupe les fragments par ligne visuelle : deux fragments appartiennent
// à la même ligne si leurs Y sont proches (tolérance proportionnelle à la
// hauteur du texte plutôt qu'un seuil fixe, pour rester correct quelle que
// soit la taille de police du document). Lignes triées de haut en bas (Y
// décroissant, repère PDF), fragments triés de gauche à droite (X
// croissant) à l'intérieur de chaque ligne.
export function groupIntoLines(items: PositionedItem[]): PositionedItem[][] {
  if (items.length === 0) return []
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x)
  const lines: PositionedItem[][] = []
  let current: PositionedItem[] = [sorted[0]]
  let currentY = sorted[0].y

  for (let i = 1; i < sorted.length; i++) {
    const item = sorted[i]
    const tolerance = Math.max(item.height, current[current.length - 1].height) * 0.5
    if (Math.abs(item.y - currentY) <= tolerance) {
      current.push(item)
    } else {
      lines.push(current.sort((a, b) => a.x - b.x))
      current = [item]
      currentY = item.y
    }
  }
  lines.push(current.sort((a, b) => a.x - b.x))
  return lines
}

// Découpe une ligne déjà triée par X en "cellules" : un écart horizontal
// supérieur à COLUMN_GAP_RATIO (proportion de la hauteur de texte, donc de
// la taille de police) signale une séparation de colonne plutôt qu'une
// simple espace entre mots — c'est ce qui permet de distinguer "deux mots"
// de "deux cellules de tableau" sans dépendre d'un caractère espace
// explicite, souvent absent entre colonnes dans le flux PDF.
//
// pdf.js matérialise lui-même le blanc entre deux fragments de texte par un
// item "espace" à part entière (str = " ", height = 0), dont le WIDTH est
// l'écart horizontal complet — et pas un écart mesurable entre deux
// fragments de texte consécutifs, puisque cet item comble déjà tout
// l'espace. Le traiter comme du texte normal (ancien comportement) absorbe
// silencieusement l'écart dans `current` et empêche tout seuil de se
// déclencher. On le traite donc à part : c'est son WIDTH qui sert de signal
// d'écart, comparé au même seuil.
const COLUMN_GAP_RATIO = 1.8

export function lineToCells(line: PositionedItem[]): string[] {
  if (line.length === 0) return []
  const cells: string[] = []
  let current = ''
  let prevRight: number | null = null
  let refHeight = line[0].height

  for (const item of line) {
    const isWhitespace = item.str.trim().length === 0
    const gap = isWhitespace ? item.width : prevRight === null ? 0 : item.x - prevRight
    const threshold = Math.max(item.height, refHeight) * COLUMN_GAP_RATIO

    if (prevRight !== null && gap > threshold) {
      cells.push(current.trim())
      current = ''
    } else if (current.length > 0 && !current.endsWith(' ') && gap > 0) {
      current += ' '
    }

    if (!isWhitespace) {
      current += item.str
      refHeight = item.height
    }
    prevRight = item.x + item.width
  }
  cells.push(current.trim())
  return cells.filter((c) => c.length > 0)
}

// Un bloc d'au moins MIN_TABLE_ROWS lignes CONSÉCUTIVES ayant chacune au
// moins 2 cellules est traité comme un tableau plutôt que comme des
// paragraphes indépendants — reformaté en tableau Markdown pour que la
// structure ligne/colonne reste explicite pour le LLM en aval (Claude,
// génération du diagramme) plutôt que noyée dans du texte continu. En
// dessous de ce seuil, une ligne à 2 cellules isolée reste un cas trop
// ambigu (simple texte avec un grand espacement) pour risquer un faux tableau.
// Limite connue : un texte sur 2 colonnes dont les lignes correspondantes
// tombent exactement à la même hauteur Y (mise en page en miroir) est
// indiscernable géométriquement d'un vrai tableau à 2 colonnes avec cette
// seule heuristique d'écart — les deux produisent des lignes à 2 cellules
// alignées. Accepté comme limitation : en pratique, du texte qui coule sur
// 2 colonnes ne cale quasiment jamais ses retours à la ligne en parfaite
// synchronisation Y d'une colonne à l'autre (paragraphes de longueurs
// différentes), contrairement à un tableau qui le fait par construction.
const MIN_TABLE_ROWS = 3

function cellsToMarkdownRow(cells: string[]): string {
  return `| ${cells.join(' | ')} |`
}

// Reconstruit le texte d'une page dans l'ordre de lecture visuel, tableaux
// détectés reformatés en Markdown — remplace l'ancienne concaténation brute
// `content.items.map(i => i.str).join(' ')` de pdfText.ts.
export function reconstructPageText(content: TextContent): string {
  const items = extractPositionedItems(content)
  const lines = groupIntoLines(items)
  const cellsByLine = lines.map(lineToCells)

  const output: string[] = []
  let i = 0
  while (i < cellsByLine.length) {
    const cells = cellsByLine[i]
    if (cells.length < 2) {
      output.push(cells.join(' '))
      i++
      continue
    }
    // Étend le bloc tant que les lignes suivantes ont aussi ≥2 cellules —
    // pas besoin que le nombre de cellules soit identique d'une ligne à
    // l'autre (une cellule vide ou fusionnée reste un tableau valide).
    let j = i
    while (j < cellsByLine.length && cellsByLine[j].length >= 2) j++
    const blockSize = j - i
    if (blockSize >= MIN_TABLE_ROWS) {
      const width = Math.max(...cellsByLine.slice(i, j).map((c) => c.length))
      output.push(cellsToMarkdownRow(cellsByLine[i]))
      output.push(cellsToMarkdownRow(new Array(width).fill('---')))
      for (let k = i + 1; k < j; k++) output.push(cellsToMarkdownRow(cellsByLine[k]))
    } else {
      for (let k = i; k < j; k++) output.push(cellsByLine[k].join('  '))
    }
    i = j
  }
  return output.join('\n')
}
