// pdfjs-dist (et son worker) pèsent plusieurs centaines de Ko à eux
// seuls : importés dynamiquement ici (plutôt qu'en haut de fichier) pour
// que ce coût ne parte que si l'utilisateur clique effectivement sur
// "Charger un PDF", au lieu d'alourdir le bundle initial de toute
// l'application pour tout le monde. Même logique pour tesseract.js
// (moteur OCR, plusieurs Mo avec son binaire WASM) : importé seulement
// pour les pages qui s'avèrent réellement sans texte natif exploitable.

import type { PDFPageProxy } from 'pdfjs-dist'
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

export type PdfExtractionMode = 'texte' | 'ocr'

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
// depuis le CDN par défaut. Seules les variantes de cœur WASM lstm et
// lstm, simd-lstm et relaxedsimd-lstm sont embarquées (~12 Mo au total) :
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
  try {
    const pdf = await loadingTask.promise
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      const nativeChars = extractPositionedItems(content).reduce((sum, item) => sum + item.str.trim().length, 0)

      if (nativeChars >= MIN_NATIVE_CHARS) {
        onProgress?.({ page: pageNum, totalPages: pdf.numPages, mode: 'texte' })
        pageTexts.push(reconstructPageText(content).trim())
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
