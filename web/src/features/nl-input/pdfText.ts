// pdfjs-dist (et son worker) pèsent plusieurs centaines de Ko à eux
// seuls : importés dynamiquement ici (plutôt qu'en haut de fichier) pour
// que ce coût ne parte que si l'utilisateur clique effectivement sur
// "Charger un PDF", au lieu d'alourdir le bundle initial de toute
// l'application pour tout le monde.

import { reconstructPageText } from './pdfLayout'

// Extrait le texte d'un PDF "texte" (créé numériquement, pas scanné),
// page par page, dans l'ordre de lecture visuel — reconstructPageText
// (pdfLayout.ts) regroupe les fragments par ligne puis colonne à partir de
// leur position réelle, et reformate les tableaux détectés en Markdown ;
// une simple concaténation `item.str` (ancien comportement) entrelaçait
// les colonnes d'un document à mise en page complexe. Ne fait pas d'OCR —
// un PDF composé uniquement d'images (document scanné) ne produira aucun
// texte exploitable ; c'est à l'appelant de le signaler à l'utilisateur
// plutôt que de générer un processus à partir d'un texte vide.
export async function extractPdfText(file: File): Promise<string> {
  const [pdfjsLib, { default: pdfWorkerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl

  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjsLib.getDocument({ data: buffer })
  try {
    const pdf = await loadingTask.promise
    const pageTexts: string[] = []
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()
      pageTexts.push(reconstructPageText(content).trim())
    }
    return pageTexts.filter(Boolean).join('\n\n')
  } finally {
    // destroy() (pas sur PDFDocumentProxy lui-même) libère le worker et
    // la mémoire associés à ce document une fois l'extraction terminée.
    await loadingTask.destroy()
  }
}
