import type { Activity, DraftSpecification, Specification } from '../../api/types'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()
const sameText = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

// `existing` inclut déjà les specs ajoutées lors des itérations précédentes
// de la boucle de fusion (mutée en place via push) : pas besoin d'offset.
function nextSssCode(existing: Specification[]) {
  const count = existing.filter((s) => s.code.startsWith('SSS-')).length
  return `SSS-${String(count + 1).padStart(3, '0')}`
}

// Une activité CIBLE d'une des missions rattachées au produit — le nom de
// l'acteur est résolu une fois par l'appelant (ProductSpecVVPanel.tsx, qui
// a accès au Project complet de chaque mission) plutôt que recalculé ici :
// ce module reste agnostique de la forme d'un Project.
export interface ActivityRow {
  missionId: string
  missionName: string
  actorName: string
  activity: Activity
}

export interface MergeSpecAcrossMissionsResult {
  specifications: Specification[]
  // Mêmes lignes qu'en entrée, dans le même ordre — seule `activity.
  // traceLinks` change, pour les lignes effectivement reliées à une
  // nouvelle spécification (ou nouvellement reliées à une spécification
  // révisée, voir revisedSpecIds ci-dessous). L'appelant regroupe par
  // missionId pour savoir quelles missions resauvegarder (voir
  // ProductSpecVVPanel.tsx).
  activityRows: ActivityRow[]
  addedCount: number
  // Nombre de propositions appliquées comme RÉVISION d'une spécification
  // déjà existante (draft.revisesCode) plutôt que comme création — voir
  // revisedSpecIds pour les ids concernés.
  revisedCount: number
  // Ids des spécifications EXISTANTES dont le texte vient d'être révisé —
  // l'appelant (ProductSpecVVPanel.handleGenerateSss) s'en sert pour
  // repasser en brouillon les scénarios de test V&V qui les vérifiaient
  // déjà (leur contenu peut ne plus correspondre au texte révisé).
  revisedSpecIds: string[]
  unmatchedActivities: string[]
}

// Fusionne les besoins partie prenante (SSS) proposés par le LLM pour
// chaque activité : une spécification StakeholderNeed est créée par
// proposition (sauf doublon exact déjà lié à la même activité), reliée à
// l'activité correspondante via traceLinks — recherchée par nom
// d'activité + nom d'acteur PARMI TOUTES LES MISSIONS rattachées au
// produit (activityRows), pas une seule mission (voir
// mergeSpecDrafts.ts, l'ancienne version mission-locale, retirée lors du
// déplacement des spécifications vers le produit). Les propositions dont
// l'activité/l'acteur ne correspond à rien dans aucune mission sont
// ignorées et remontées dans unmatchedActivities. En cas d'ambiguïté (même
// nom d'activité + nom d'acteur dans deux missions différentes), la
// PREMIÈRE ligne rencontrée est retenue — limite acceptée, cohérente avec
// la résolution déjà par nom (jamais par id) du reste de l'app.
export function mergeSpecDraftsAcrossMissions(
  specifications: Specification[],
  activityRows: ActivityRow[],
  drafts: DraftSpecification[],
): MergeSpecAcrossMissionsResult {
  // Copie superficielle de CHAQUE spécification (pas seulement du tableau) :
  // une révision (ci-dessous) mute l'objet en place (text/rationale/status),
  // ce qui toucherait par erreur l'état React d'origine (`specifications`,
  // passé par référence par l'appelant) si on gardait les mêmes objets.
  const nextSpecifications: Specification[] = specifications.map((s) => ({ ...s }))
  const nextRows = activityRows.map((r) => ({ ...r, activity: { ...r.activity, traceLinks: [...r.activity.traceLinks] } }))
  const unmatchedActivities: string[] = []
  const revisedSpecIds: string[] = []
  let addedCount = 0
  let revisedCount = 0

  for (const draft of drafts) {
    const row = nextRows.find((r) => sameName(r.activity.name, draft.activityName) && sameName(r.actorName, draft.actorName))
    if (!row) {
      unmatchedActivities.push(`${draft.activityName} (${draft.actorName})`)
      continue
    }

    if (draft.revisesCode) {
      const existing = nextSpecifications.find((s) => s.code === draft.revisesCode)
      if (existing) {
        const previousText = existing.text
        existing.text = draft.text
        existing.rationale = draft.rationale
          ? `${draft.rationale} (texte précédent : « ${previousText} »)`
          : `Révisée automatiquement — texte précédent : « ${previousText} »`
        // Repasse en brouillon même si déjà approuvée : le texte a changé,
        // la relecture/validation humaine doit reprendre (jamais une
        // révision silencieusement approuvée).
        existing.status = 'draft'
        revisedCount++
        revisedSpecIds.push(existing.id)
        if (!row.activity.traceLinks.includes(existing.id)) {
          row.activity.traceLinks.push(existing.id)
        }
        continue
      }
      // Code inconnu (ex. spécification supprimée entre-temps) : repli
      // silencieux sur la création, comme si revisesCode était absent.
    }

    const alreadyLinked = row.activity.traceLinks
      .map((id) => nextSpecifications.find((s) => s.id === id))
      .some((s) => s && sameText(s.text, draft.text))
    if (alreadyLinked) continue

    const spec: Specification = {
      id: newId('spec'),
      code: nextSssCode(nextSpecifications),
      type: 'StakeholderNeed',
      text: draft.text,
      rationale: draft.rationale,
      status: 'draft',
      priority: 'must',
    }
    nextSpecifications.push(spec)
    addedCount++
    row.activity.traceLinks.push(spec.id)
  }

  return { specifications: nextSpecifications, activityRows: nextRows, addedCount, revisedCount, revisedSpecIds, unmatchedActivities }
}
