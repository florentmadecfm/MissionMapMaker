// pdfjs-dist (et son worker) pèsent plusieurs centaines de Ko à eux
// seuls : importés dynamiquement ici (plutôt qu'en haut de fichier) pour
// que ce coût ne parte que si l'utilisateur clique effectivement sur
// "Charger un PDF", au lieu d'alourdir le bundle initial de toute
// l'application pour tout le monde. Même logique pour tesseract.js
// (moteur OCR, plusieurs Mo avec son binaire WASM) : importé seulement
// pour les pages qui s'avèrent réellement sans texte natif exploitable.

import type { OPS, PDFPageProxy } from 'pdfjs-dist'
import { extractPositionedItems, reconstructPageText } from './pdfLayout'

// En dessous de ce nombre de caractères natifs, une page est considérée
// sans texte exploitable (typiquement une page scannée composée
// uniquement d'une image) plutôt que comme un texte natif très court —
// bascule alors sur l'OCR plutôt que de renvoyer une page quasi vide.
const MIN_NATIVE_CHARS = 5

// Échelle de rendu pour l'OCR (le viewport de base d'une page PDF
// correspond à 72 DPI) : ×3 ≈ 216 DPI, un compromis qui reste net pour
// tesseract.js sur du texte de taille courante sans exploser le temps de
// reconnaissance — cette branche ne s'exécute de toute façon que pour des
// pages sans aucun texte natif, où le coût est déjà accepté.
const OCR_RENDER_SCALE = 3

export type PdfExtractionMode = 'texte' | 'ocr' | 'schema'

export interface PdfExtractionProgress {
  page: number
  totalPages: number
  mode: PdfExtractionMode
}

// Créée seulement au premier besoin (voir extractPdfText) plutôt qu'au
// chargement du module : évite d'importer tesseract.js pour un PDF dont
// toutes les pages ont du texte natif.
//
// tesseract.js va par défaut chercher son worker, son cœur WASM et les
// données de langue sur le CDN jsdelivr — ce qui romprait le
// fonctionnement en réseau restreint/hors-ligne (voir router.go : toute
// l'appli est déjà embarquée dans un seul binaire Go via go:embed) et
// ajoute une dépendance d'exécution à un service tiers pour une
// fonctionnalité cœur du produit. Ces fichiers sont donc auto-hébergés
// dans public/tesseract (copiés tels quels dans dist/ par Vite, donc
// embarqués dans le binaire comme le reste du build) plutôt que chargés
// depuis le CDN par défaut. Seules les variantes de cœur WASM lstm,
// simd-lstm et relaxedsimd-lstm sont embarquées (~12 Mo au total) :
// les navigateurs Chromium récents détectent déjà le SIMD "relaxé" et
// échoueraient sans ce 3e fichier — calibré empiriquement (voir E2E).
async function createOcrWorker() {
  const { createWorker } = await import('tesseract.js')
  return createWorker('fra', undefined, {
    workerPath: '/tesseract/worker.min.js',
    corePath: '/tesseract',
    langPath: '/tesseract/lang-data',
  })
}

type OcrWorker = Awaited<ReturnType<typeof createOcrWorker>>

async function ocrPage(page: PDFPageProxy, worker: OcrWorker): Promise<string> {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE })
  const canvas = document.createElement('canvas')
  canvas.width = viewport.width
  canvas.height = viewport.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  await page.render({ canvasContext: ctx, viewport }).promise
  const {
    data: { text },
  } = await worker.recognize(canvas)
  return text
}

// Une page à texte natif exploitable peut malgré tout contenir un schéma
// ou diagramme intégré comme image (capture d'écran collée dans un
// document, export d'un outil de diagramme) : ce texte-là n'existe nulle
// part dans la couche de texte du PDF. Détecté via la présence d'un
// opérateur de peinture d'image dans le flux de contenu de la page —
// getOperatorList() analyse le flux sans avoir besoin de décoder l'image
// elle-même (donc sans dépendre de la résolution asynchrone des objets
// pdf.js, plus fragile). paintImageMaskXObject (pochoirs 1 bit utilisés
// aussi pour des remplissages vectoriels) est volontairement exclu : trop
// souvent un simple artefact de rendu plutôt qu'une image porteuse
// d'information.
async function pageHasEmbeddedImage(page: PDFPageProxy, ops: typeof OPS): Promise<boolean> {
  const { fnArray } = await page.getOperatorList()
  const imageOps = new Set([ops.paintImageXObject, ops.paintImageXObjectRepeat, ops.paintInlineImageXObject, ops.paintInlineImageXObjectGroup])
  return fnArray.some((op) => imageOps.has(op))
}

function normalizeForDedup(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Ne garde que les lignes de l'OCR absentes du texte natif déjà extrait
// (substring simple, suffisant pour écarter les doublons évidents plutôt
// que de dupliquer un paragraphe déjà lu nativement) — l'OCR d'une page
// entière capte aussi tout le texte déjà natif, pas seulement celui du
// schéma qu'on cherche à récupérer. Lignes de moins de 3 caractères
// écartées (bruit de reconnaissance : ponctuation isolée, artefacts).
function extractNewOcrLines(nativeText: string, ocrText: string): string[] {
  const nativeNormalized = normalizeForDedup(nativeText)
  const seen = new Set<string>()
  const newLines: string[] = []
  for (const rawLine of ocrText.split('\n')) {
    const line = rawLine.trim()
    if (line.length < 3) continue
    const normalized = normalizeForDedup(line)
    if (seen.has(normalized) || nativeNormalized.includes(normalized)) continue
    seen.add(normalized)
    newLines.push(line)
  }
  return newLines
}

// Garde-fou de coût : un document dont chaque page porte un logo ou un
// en-tête répété (cas très courant) ferait sinon relancer un OCR de page
// entière (coûteux, plusieurs secondes) sur CHAQUE page pour un résultat
// systématiquement vide après déduplication. Après ce nombre de pages
// consécutives où la détection de schéma n'a rien ajouté de nouveau, elle
// se désactive pour le reste du document — un document réellement riche
// en schémas continue, lui, à en trouver à chaque fois et n'est jamais
// désactivé.
const MAX_UNPRODUCTIVE_SCHEMA_PAGES = 3

// Extrait le texte d'un PDF, page par page, dans l'ordre de lecture
// visuel. Pour chaque page : texte natif reconstruit avec mise en page
// (reconstructPageText, pdfLayout.ts) si le PDF en contient suffisamment ;
// sinon (page scannée / image) repli sur l'OCR via tesseract.js, appliqué
// à un rendu de la page. onProgress permet à l'appelant d'afficher un
// état d'avancement, l'OCR étant nettement plus lent que la lecture du
// texte natif.
export async function extractPdfText(
  file: File,
  onProgress?: (progress: PdfExtractionProgress) => void,
): Promise<string> {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buffer })
  let ocrWorker: OcrWorker | null = null
  let unproductiveSchemaStreak = 0
  let schemaDetectionDisabled = false
  try {
    const pdf = await loadingTask.promise
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const nativeChars = extractPositionedItems(content).reduce((sum, item) => sum + item.str.trim().length, 0)

      if (nativeChars >= MIN_NATIVE_CHARS) {
        onProgress?.({ page: pageNum, totalPages: pdf.numPages, mode: 'texte' })
        const nativeText = reconstructPageText(content).trim()
        let pageText = nativeText

        if (!schemaDetectionDisabled && (await pageHasEmbeddedImage(page, pdfjsLib.OPS))) {
          onProgress?.({ page: pageNum, totalPages: pdf.numPages, mode: 'schema' })
          ocrWorker ??= await createOcrWorker()
          const newLines = extractNewOcrLines(nativeText, await ocrPage(page, ocrWorker))
          if (newLines.length > 0) {
            pageText += `\n\n[Texte détecté dans un schéma/diagramme de la page ${pageNum}]\n${newLines.join('\n')}`
            unproductiveSchemaStreak = 0
          } else {
            unproductiveSchemaStreak++
            if (unproductiveSchemaStreak >= MAX_UNPRODUCTIVE_SCHEMA_PAGES) schemaDetectionDisabled = true
          }
        }
        pageTexts.push(pageText)
      } else {
        onProgress?.({ page: pageNum, totalPages: pdf.numPages, mode: 'ocr' })
        ocrWorker ??= await createOcrWorker()
        pageTexts.push((await ocrPage(page, ocrWorker)).trim())
      }
    }
    return pageTexts.filter(Boolean).join('\n\n')
  } finally {
    // destroy() (pas sur PDFDocumentProxy lui-même) libère le worker et
    // la mémoire associés à ce document une fois l'extraction terminée.
    await loadingTask.destroy()
    await ocrWorker?.terminate()
  }
}
