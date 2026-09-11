import type { Project } from '../../api/types'

// exceljs pèse plusieurs centaines de Ko à lui seul : importé
// dynamiquement ici plutôt qu'en haut de fichier, pour que ce coût ne
// parte que si l'utilisateur clique effectivement sur "Exporter en
// Excel", au lieu d'alourdir le bundle initial de toute l'application
// (même principe que l'extraction de PDF, voir pdfText.ts). Préféré à
// `xlsx` (SheetJS), qui porte une vulnérabilité haute sévérité non
// corrigée sur le registre npm (prototype pollution / ReDoS).

function actorName(project: Project, actorId: string) {
  return project.actors.find((a) => a.id === actorId)?.name ?? '(acteur supprimé)'
}

function phaseName(project: Project, phaseId: string) {
  return project.phases.find((p) => p.id === phaseId)?.name ?? '(phase supprimée)'
}

function activityLabel(project: Project, activityId: string) {
  const act = project.activities.find((a) => a.id === activityId)
  if (!act) return '(activité supprimée)'
  return `${act.name} (${actorName(project, act.actorId)})`
}

const SPEC_TYPE_LABELS: Record<string, string> = {
  StakeholderNeed: 'Besoin partie prenante (SSS)',
  SystemRequirement: 'Exigence système',
  SubsystemRequirement: 'Exigence sous-système',
  VerificationCriterion: 'Critère de vérification',
}

interface Column {
  header: string
  key: string
  width: number
}

// Assemble une feuille par catégorie (acteurs, phases, activités, user
// stories, interactions, spécifications, tests V&V, traçabilité), avec
// des libellés lisibles (noms résolus depuis les ids) plutôt que les
// identifiants internes bruts, et déclenche le téléchargement du
// classeur.
export async function exportProjectToExcel(project: Project) {
  const ExcelJS = (await import('exceljs')).default

  const wb = new ExcelJS.Workbook()
  wb.creator = 'MissionMapMaker'
  wb.created = new Date()

  const addSheet = (name: string, columns: Column[], rows: Record<string, unknown>[]) => {
    const sheet = wb.addWorksheet(name)
    sheet.columns = columns
    sheet.getRow(1).font = { bold: true }
    sheet.addRows(rows)
  }

  addSheet(
    'Acteurs',
    [
      { header: 'Nom', key: 'nom', width: 26 },
      { header: 'Couleur', key: 'couleur', width: 12 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Sous-lignes', key: 'sousLignes', width: 12 },
    ],
    project.actors.map((a) => ({ nom: a.name, couleur: a.color, description: a.description, sousLignes: a.subLanes })),
  )

  addSheet(
    'Phases',
    [
      { header: 'Ordre', key: 'ordre', width: 8 },
      { header: 'Nom', key: 'nom', width: 40 },
      { header: 'Sous-colonnes', key: 'sousColonnes', width: 14 },
    ],
    [...project.phases]
      .sort((a, b) => a.order - b.order)
      .map((p) => ({ ordre: p.order, nom: p.name, sousColonnes: p.subColumns })),
  )

  addSheet(
    'Activités',
    [
      { header: 'Nom', key: 'nom', width: 40 },
      { header: 'Acteur', key: 'acteur', width: 24 },
      { header: 'Phase', key: 'phase', width: 24 },
      { header: 'Description', key: 'description', width: 50 },
      { header: 'Texte source', key: 'texteSource', width: 50 },
      { header: 'Spécifications liées', key: 'specs', width: 30 },
      { header: 'Sous-colonne', key: 'sousColonne', width: 12 },
      { header: 'Sous-ligne', key: 'sousLigne', width: 12 },
      { header: 'Décalage X', key: 'decalageX', width: 12 },
      { header: 'Décalage Y', key: 'decalageY', width: 12 },
    ],
    project.activities.map((act) => ({
      nom: act.name,
      acteur: actorName(project, act.actorId),
      phase: phaseName(project, act.phaseId),
      description: act.description,
      texteSource: act.sourceText ?? '',
      specs: act.traceLinks
        .map((specId) => project.specifications.find((s) => s.id === specId)?.code)
        .filter(Boolean)
        .join(', '),
      sousColonne: act.column,
      sousLigne: act.subRow,
      decalageX: act.offsetX,
      decalageY: act.offsetY,
    })),
  )

  addSheet(
    'User stories',
    [
      { header: 'Activité', key: 'activite', width: 40 },
      { header: 'Acteur', key: 'acteur', width: 24 },
      { header: 'Titre', key: 'titre', width: 40 },
      { header: 'Priorité', key: 'priorite', width: 12 },
      { header: 'Release', key: 'release', width: 14 },
      { header: 'Statut', key: 'statut', width: 14 },
    ],
    project.activities.flatMap((act) =>
      act.userStories.map((us) => ({
        activite: act.name,
        acteur: actorName(project, act.actorId),
        titre: us.title,
        priorite: us.priority,
        release: us.release,
        statut: us.status,
      })),
    ),
  )

  addSheet(
    'Interactions',
    [
      { header: 'Depuis', key: 'depuis', width: 34 },
      { header: 'Vers', key: 'vers', width: 34 },
      { header: 'Information échangée', key: 'information', width: 40 },
      { header: 'Description', key: 'description', width: 40 },
    ],
    project.interactions.map((i) => ({
      depuis: activityLabel(project, i.fromActivityId),
      vers: activityLabel(project, i.toActivityId),
      information: i.information,
      description: i.description ?? '',
    })),
  )

  addSheet(
    'Spécifications',
    [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Type', key: 'type', width: 28 },
      { header: 'Texte', key: 'texte', width: 60 },
      { header: 'Justification', key: 'justification', width: 40 },
      { header: 'Parent', key: 'parent', width: 12 },
      { header: 'Statut', key: 'statut', width: 12 },
      { header: 'Priorité', key: 'priorite', width: 12 },
    ],
    project.specifications.map((s) => ({
      code: s.code,
      type: SPEC_TYPE_LABELS[s.type] ?? s.type,
      texte: s.text,
      justification: s.rationale ?? '',
      parent: project.specifications.find((p) => p.id === s.parentId)?.code ?? '',
      statut: s.status,
      priorite: s.priority,
    })),
  )

  addSheet(
    'Tests V&V',
    [
      { header: 'Code', key: 'code', width: 12 },
      { header: 'Titre', key: 'titre', width: 40 },
      { header: 'Spécification', key: 'specification', width: 14 },
      { header: 'Préconditions', key: 'preconditions', width: 40 },
      { header: 'Étapes', key: 'etapes', width: 60 },
      { header: 'Statut', key: 'statut', width: 12 },
    ],
    project.testScenarios.map((t) => ({
      code: t.code,
      titre: t.title,
      specification: project.specifications.find((s) => s.id === t.specificationId)?.code ?? '',
      preconditions: t.preconditions ?? '',
      etapes: t.steps.map((s, i) => `${i + 1}. ${s.action} → ${s.expectedResult}`).join('\n'),
      statut: t.status,
    })),
  )

  addSheet(
    'Traçabilité',
    [
      { header: 'Activité', key: 'activite', width: 40 },
      { header: 'Acteur', key: 'acteur', width: 24 },
      { header: 'Spécification', key: 'specification', width: 14 },
      { header: 'Texte de la spécification', key: 'texte', width: 60 },
      { header: 'Testée par', key: 'testeePar', width: 24 },
    ],
    project.activities.flatMap((act) =>
      act.traceLinks.map((specId) => {
        const spec = project.specifications.find((s) => s.id === specId)
        const testedBy = project.testScenarios
          .filter((t) => t.specificationId === specId)
          .map((t) => t.code)
          .join(', ')
        return {
          activite: act.name,
          acteur: actorName(project, act.actorId),
          specification: spec?.code ?? '(spécification supprimée)',
          texte: spec?.text ?? '',
          testeePar: testedBy || '—',
        }
      }),
    ),
  )

  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = `${project.name || 'projet'}.xlsx`.replace(/[/\\?%*:|"<>]/g, '_')
    link.click()
  } finally {
    URL.revokeObjectURL(url)
  }
}
