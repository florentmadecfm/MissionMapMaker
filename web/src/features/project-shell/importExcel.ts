import type {
  Activity,
  Actor,
  ActorGoal,
  ActorPainPoint,
  Interaction,
  PainPoint,
  Phase,
  Project,
  Specification,
  SpecificationType,
  TestScenario,
  TestStep,
  UserStory,
} from '../../api/types'

// Reconstruit un projet à partir du classeur Excel produit par
// exportProjectToExcel (exportExcel.ts) : lecture par NOM de colonne (pas
// par index) puisque exceljs ne conserve pas, au chargement d'un fichier
// existant, les clés de colonne posées à l'écriture — seul le texte de
// l'en-tête (ligne 1) survit dans le fichier réellement écrit sur disque.
// Comme pour l'export, importé dynamiquement pour ne pas alourdir le
// bundle initial (voir exportExcel.ts).

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const SPEC_TYPE_LABELS: Record<SpecificationType, string> = {
  StakeholderNeed: 'Besoin partie prenante (SSS)',
  SystemRequirement: 'Exigence système',
  SubsystemRequirement: 'Exigence sous-système',
  VerificationCriterion: 'Critère de vérification',
}
const SPEC_LABEL_TO_TYPE: Record<string, SpecificationType> = Object.fromEntries(
  (Object.entries(SPEC_TYPE_LABELS) as [SpecificationType, string][]).map(([type, label]) => [label, type]),
)

function coerce<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  const v = value.trim().toLowerCase()
  return (allowed as readonly string[]).includes(v) ? (v as T) : fallback
}

function toNumber(value: string, fallback = 0): number {
  const n = Number(value.trim())
  return Number.isFinite(n) ? n : fallback
}

// Une cellule exceljs peut être une valeur brute (ce que l'export écrit
// toujours) ou, si le fichier a été retouché à la main (texte enrichi,
// hyperlien, formule...), un objet porteur — on ne garde alors que le
// texte affichable plutôt que de planter ou d'importer "[object Object]".
function cellToString(value: unknown): string {
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const v = value as { richText?: { text: string }[]; text?: string; result?: unknown }
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('')
    if (typeof v.text === 'string') return v.text
    if (v.result != null) return String(v.result)
    return ''
  }
  return String(value)
}

async function readSheet(wb: import('exceljs').Workbook, name: string): Promise<Record<string, string>[]> {
  const sheet = wb.getWorksheet(name)
  if (!sheet) return []

  const headers: Record<number, string> = {}
  sheet.getRow(1).eachCell({ includeEmpty: false }, (cell, colNumber) => {
    headers[colNumber] = cellToString(cell.value).trim()
  })

  const rows: Record<string, string>[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const obj: Record<string, string> = {}
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber]
      if (header) obj[header] = cellToString(cell.value)
    })
    if (Object.values(obj).some((v) => v.trim() !== '')) rows.push(obj)
  })
  return rows
}

// Découpe "Nom de l'activité (Nom de l'acteur)" — format écrit par
// activityLabel() à l'export — en (nomActivité, nomActeur). `.*` étant
// gourmand par défaut, le groupe 1 absorbe tout sauf la toute dernière
// parenthèse du texte, ce qui reste correct même si le nom de l'activité
// contient lui-même des parenthèses.
function splitActivityLabel(label: string): { name: string; actorName: string } | null {
  const m = /^(.*)\s+\(([^()]*)\)$/.exec(label.trim())
  if (!m) return null
  return { name: m[1].trim(), actorName: m[2].trim() }
}

// Découpe le texte "1. Action → Résultat attendu\n2. ..." écrit par
// exportExcel.ts en étapes structurées.
function parseSteps(text: string): TestStep[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const withoutNumber = line.replace(/^\d+\.\s*/, '')
      const [action, expectedResult] = withoutNumber.split('→').map((s) => s.trim())
      return { action: action ?? '', expectedResult: expectedResult ?? '' }
    })
    .filter((s) => s.action !== '' || s.expectedResult !== '')
}

// Reconstruit un Project à partir d'un fichier .xlsx exporté par
// exportProjectToExcel — remplace les 6 collections de `base` (le projet
// actuellement ouvert) par le contenu du fichier, en conservant
// id/name/createdAt/updatedAt de `base` (le classeur ne les porte pas).
// Comme toute autre opération de cet écran, le résultat n'est qu'un
// nouvel état local : rien n'est persisté tant que l'utilisateur ne
// clique pas sur Sauvegarder, ce qui laisse l'occasion de relire/annuler.
export async function importProjectFromExcel(file: File, base: Project): Promise<Project> {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  // exceljs type son argument comme un Buffer Node, mais accepte en
  // pratique un ArrayBuffer côté navigateur (bundle isomorphe) — ce
  // projet frontend n'a pas @types/node, donc le type attendu est
  // récupéré structurellement via Parameters<> plutôt que d'écrire
  // `Buffer` (introuvable) ou `any` (que ce projet évite partout ailleurs).
  type XlsxBuffer = Parameters<typeof wb.xlsx.load>[0]
  await wb.xlsx.load(new Uint8Array(await file.arrayBuffer()) as unknown as XlsxBuffer)

  const actorRows = await readSheet(wb, 'Acteurs')
  const actors: Actor[] = actorRows.map((r) => ({
    id: newId('act'),
    name: r['Nom'] ?? '',
    color: r['Couleur'] || '#2563eb',
    description: r['Description'] ?? '',
    subLanes: toNumber(r['Sous-lignes'] ?? '0'),
    about: r['À propos'] ?? '',
    bio: r['Bio'] ?? '',
    goals: [],
    painPoints: [],
  }))
  const actorIdByName = new Map(actors.map((a) => [a.name.trim().toLowerCase(), a.id]))

  const actorGoalRows = await readSheet(wb, 'Objectifs acteur')
  for (const r of actorGoalRows) {
    const actor = actors.find((a) => a.name.trim().toLowerCase() === (r['Acteur'] ?? '').trim().toLowerCase())
    const text = (r['Texte'] ?? '').trim()
    if (!actor || !text) continue
    const goal: ActorGoal = { id: newId('goal'), text }
    actor.goals.push(goal)
  }

  const actorPainPointRows = await readSheet(wb, 'Points de friction acteur')
  for (const r of actorPainPointRows) {
    const actor = actors.find((a) => a.name.trim().toLowerCase() === (r['Acteur'] ?? '').trim().toLowerCase())
    const text = (r['Texte'] ?? '').trim()
    if (!actor || !text) continue
    const painPoint: ActorPainPoint = { id: newId('app'), text }
    actor.painPoints.push(painPoint)
  }

  const phaseRows = await readSheet(wb, 'Phases')
  const phases: Phase[] = phaseRows.map((r, i) => ({
    id: newId('ph'),
    name: r['Nom'] ?? '',
    order: toNumber(r['Ordre'] ?? '0', i + 1),
    subColumns: toNumber(r['Sous-colonnes'] ?? '0'),
  }))
  const phaseIdByName = new Map(phases.map((p) => [p.name.trim().toLowerCase(), p.id]))

  // Les spécifications sont créées en 2 passes : la colonne "Parent" d'une
  // ligne peut référencer une autre spécification listée plus bas dans la
  // feuille (l'export ne garantit pas un ordre topologique).
  const specRows = await readSheet(wb, 'Spécifications')
  const specifications: Specification[] = specRows.map((r) => ({
    id: newId('spec'),
    code: r['Code'] ?? '',
    type: SPEC_LABEL_TO_TYPE[r['Type'] ?? ''] ?? (r['Type'] as SpecificationType) ?? 'StakeholderNeed',
    text: r['Texte'] ?? '',
    rationale: r['Justification'] || undefined,
    status: coerce(r['Statut'] ?? '', ['draft', 'approved', 'deprecated'], 'draft'),
    priority: r['Priorité'] || 'should',
  }))
  const specIdByCode = new Map(specifications.map((s) => [s.code.trim().toLowerCase(), s.id]))
  specRows.forEach((r, i) => {
    const parentCode = (r['Parent'] ?? '').trim()
    if (parentCode) {
      specifications[i].parentId = specIdByCode.get(parentCode.toLowerCase())
    }
  })

  const activityRows = await readSheet(wb, 'Activités')
  const activities: Activity[] = activityRows.map((r) => {
    const actorId = actorIdByName.get((r['Acteur'] ?? '').trim().toLowerCase()) ?? actors[0]?.id ?? ''
    const phaseId = phaseIdByName.get((r['Phase'] ?? '').trim().toLowerCase()) ?? phases[0]?.id ?? ''
    const traceLinks = (r['Spécifications liées'] ?? '')
      .split(',')
      .map((code) => specIdByCode.get(code.trim().toLowerCase()))
      .filter((id): id is string => Boolean(id))
    return {
      id: newId('a'),
      name: r['Nom'] ?? '',
      actorId,
      phaseId,
      order: 0,
      column: toNumber(r['Sous-colonne'] ?? '0'),
      subRow: toNumber(r['Sous-ligne'] ?? '0'),
      offsetX: toNumber(r['Décalage X'] ?? '0'),
      offsetY: toNumber(r['Décalage Y'] ?? '0'),
      description: r['Description'] ?? '',
      sourceText: r['Texte source'] || undefined,
      userStories: [],
      traceLinks,
      painPoints: [],
    }
  })
  activities.forEach((a, i) => {
    a.order = i + 1
  })
  // Résolution par (nom d'activité, nom d'acteur) — même clé de
  // désambiguïsation qu'ailleurs dans l'app (mergeDraft.ts) : deux
  // activités homonymes portées par des acteurs différents restent
  // distinctes.
  const activityIdByKey = new Map(
    activities.map((a) => [`${a.name.trim().toLowerCase()}::${a.actorId}`, a.id]),
  )
  function findActivity(name: string, actorName: string) {
    const actorId = actorIdByName.get(actorName.trim().toLowerCase())
    if (!actorId) return undefined
    return activityIdByKey.get(`${name.trim().toLowerCase()}::${actorId}`)
  }

  const userStoryRows = await readSheet(wb, 'User stories')
  for (const r of userStoryRows) {
    const activityId = findActivity(r['Activité'] ?? '', r['Acteur'] ?? '')
    const activity = activities.find((a) => a.id === activityId)
    if (!activity) continue
    const story: UserStory = {
      id: newId('us'),
      title: r['Titre'] ?? '',
      priority: coerce(r['Priorité'] ?? '', ['must', 'should', 'could', 'wont'], 'should'),
      release: r['Release'] ?? '',
      status: coerce(r['Statut'] ?? '', ['todo', 'in_progress', 'done'], 'todo'),
    }
    activity.userStories.push(story)
  }

  const painPointRows = await readSheet(wb, 'Points de friction')
  for (const r of painPointRows) {
    const activityId = findActivity(r['Activité'] ?? '', r['Acteur'] ?? '')
    const activity = activities.find((a) => a.id === activityId)
    const text = (r['Texte'] ?? '').trim()
    if (!activity || !text) continue
    const painPoint: PainPoint = { id: newId('pp'), text }
    activity.painPoints.push(painPoint)
  }

  const interactionRows = await readSheet(wb, 'Interactions')
  const interactions: Interaction[] = []
  for (const r of interactionRows) {
    const from = splitActivityLabel(r['Depuis'] ?? '')
    const to = splitActivityLabel(r['Vers'] ?? '')
    if (!from || !to) continue
    const fromActivityId = findActivity(from.name, from.actorName)
    const toActivityId = findActivity(to.name, to.actorName)
    if (!fromActivityId || !toActivityId) continue
    interactions.push({
      id: newId('int'),
      fromActivityId,
      toActivityId,
      information: r['Information échangée'] ?? '',
      description: r['Description'] || undefined,
    })
  }

  const testRows = await readSheet(wb, 'Tests V&V')
  const testScenarios: TestScenario[] = testRows.map((r) => ({
    id: newId('test'),
    code: r['Code'] ?? '',
    title: r['Titre'] ?? '',
    specificationId: specIdByCode.get((r['Spécification'] ?? '').trim().toLowerCase()) ?? '',
    preconditions: r['Préconditions'] || undefined,
    steps: parseSteps(r['Étapes'] ?? ''),
    status: coerce(r['Statut'] ?? '', ['draft', 'approved', 'deprecated'], 'draft'),
  }))

  return {
    ...base,
    actors,
    phases,
    activities,
    interactions,
    specifications,
    testScenarios,
  }
}
