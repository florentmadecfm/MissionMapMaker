import { useEffect, useState } from 'react'
import { api } from '../../api/client'
import { classifyGenerationError } from '../../api/generationErrors'
import type { Product, ProjectSummary, Project, Specification, SpecificationType } from '../../api/types'
import { ListFilterInput } from '../../components/ListFilterInput'
import { Spinner } from '../../components/Spinner'
import type { ActivityRow } from './mergeSpecDraftsAcrossMissions'
import { mergeSpecDraftsAcrossMissions } from './mergeSpecDraftsAcrossMissions'
import { formatActivityList, phaseNameOf, rowsNotIn } from './activityDelta'
import { mergeTestScenarioDrafts } from './mergeTestScenarioDrafts'
import { TestScenariosPanel } from './TestScenariosPanel'
import { TraceabilityMatrix } from './TraceabilityMatrix'

function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

// Voir la même constante dans ProjectEditor.tsx : n'affiche le champ de
// recherche qu'au-delà de ce nombre de spécifications.
const FILTER_THRESHOLD = 8

function filterByQuery<T>(items: T[], query: string, fields: (item: T) => string[]): T[] {
  const q = query.trim().toLowerCase()
  if (!q) return items
  return items.filter((item) => fields(item).some((f) => f.toLowerCase().includes(q)))
}

function suggestionsFor<T>(items: T[], fields: (item: T) => string[]): string[] {
  const values = new Set<string>()
  for (const item of items) {
    for (const f of fields(item)) {
      const trimmed = f.trim()
      if (trimmed) values.add(trimmed)
    }
  }
  return [...values].sort((a, b) => a.localeCompare(b))
}

const SPEC_TYPES: { value: SpecificationType; label: string }[] = [
  { value: 'StakeholderNeed', label: 'Besoin partie prenante (SSS)' },
  { value: 'SystemRequirement', label: 'Exigence système' },
  { value: 'SubsystemRequirement', label: 'Exigence sous-système' },
  { value: 'VerificationCriterion', label: 'Critère de vérification' },
]

export type SubTab = 'specifications' | 'tests' | 'matrix'

interface Props {
  product: Product
  // Marque le brouillon du produit "sale" avant de l'appliquer — mêmes
  // garanties que setDraftDirty dans ProductsScreen.tsx (qui fournit cette
  // fonction), autosave débouncée gérée là-bas.
  onChange: (product: Product) => void
  // Missions déjà filtrées sur CE produit (ProductsScreen.tsx) — la
  // traçabilité/génération de ce panneau porte sur leur variante CIBLE
  // (ADR : décision utilisateur lors du déplacement des specs/tests vers
  // le produit, seule la Cible participe désormais à la traçabilité).
  linkedMissions: ProjectSummary[]
  // Rafraîchit la liste de missions du shell après une sauvegarde directe
  // d'une mission depuis ce panneau (toggle de la matrice, génération,
  // suppression d'une spécification) — même rôle que onMissionsChanged
  // dans ProductsScreen.tsx (ex. after handleLinkMission).
  onMissionsChanged: () => void
  // Sous-onglet imposé par la visite guidée (WelcomeTour.tsx) — undefined
  // en usage normal, où subTab reste piloté uniquement par les clics
  // ci-dessous. Même patron que l'ancien SpecificationsPanel.tsx.
  forcedSubTab?: SubTab
  // Missions à afficher directement, sans passer par l'API (visite guidée
  // uniquement, ProjectShell.tsx) — TOUR_DEMO_PROJECT n'est jamais
  // persisté, donc `api.getProject(TOUR_DEMO_PROJECT_ID)` échouerait
  // (404) si on le laissait suivre le chemin normal ci-dessous. undefined
  // en usage normal (le comportement par défaut, basé sur `linkedMissions`,
  // reste inchangé).
  demoMissionProjects?: Project[]
}

// Onglet "Spécification et VV" de ProductsScreen.tsx — déplacé depuis
// l'ancien onglet mission "Spécifications" (SpecificationsPanel.tsx,
// features/specifications) lors du passage des spécifications/tests au
// niveau du PRODUIT : une exigence qualifie le produit, pas une mission,
// et doit pouvoir tracer des activités réparties sur plusieurs missions
// rattachées au même produit. Charge le Project complet de chaque mission
// liée (pour leur variante CIBLE uniquement, voir activityRows ci-dessous)
// — même patron que KpiMissionImpact.tsx (ProductsScreen.tsx, vue
// 'impact'), mais en état local indépendant : ce panneau sauvegarde
// directement une mission dès qu'une de ses activités change (toggle de
// la matrice, génération), jamais via l'autosave de ProductsScreen (qui ne
// porte que sur le produit).
export function ProductSpecVVPanel({
  product,
  onChange,
  linkedMissions,
  onMissionsChanged,
  forcedSubTab,
  demoMissionProjects,
}: Props) {
  const [subTab, setSubTab] = useState<SubTab>('specifications')
  useEffect(() => {
    if (forcedSubTab) setSubTab(forcedSubTab)
  }, [forcedSubTab])

  const [missionProjects, setMissionProjects] = useState<Project[]>([])
  const [loadingMissions, setLoadingMissions] = useState(false)
  const [missionsError, setMissionsError] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const [generating, setGenerating] = useState(false)
  const [generateError, setGenerateError] = useState<string | null>(null)
  const [generateNotConfigured, setGenerateNotConfigured] = useState(false)
  const [generateRateLimited, setGenerateRateLimited] = useState(false)
  const [generateInfo, setGenerateInfo] = useState<string | null>(null)
  const [specFilter, setSpecFilter] = useState('')

  // Clé stable (liste d'ids triée) plutôt que `linkedMissions` lui-même
  // (un nouveau tableau à chaque rendu de ProductsScreen, qui le recalcule
  // par filter()) : sans elle, cet effet se redéclencherait à CHAQUE
  // rendu du parent, pas seulement quand l'ensemble de missions liées
  // change réellement.
  const linkedMissionIds = [...linkedMissions.map((m) => m.id)].sort().join(',')

  useEffect(() => {
    if (demoMissionProjects) {
      setMissionProjects(demoMissionProjects)
      return
    }
    const ids = linkedMissions.map((m) => m.id)
    if (ids.length === 0) {
      setMissionProjects([])
      return
    }
    setLoadingMissions(true)
    setMissionsError(null)
    Promise.all(ids.map((id) => api.getProject(id)))
      .then(setMissionProjects)
      .catch((e) => setMissionsError(String(e)))
      .finally(() => setLoadingMissions(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkedMissionIds, demoMissionProjects])

  // Activités CIBLE de toutes les missions liées, aplaties en une seule
  // liste avec de quoi retrouver leur mission/acteur d'origine — une
  // mission sans cible (target absent, jamais créée) ne contribue aucune
  // ligne : seule la Cible participe à la traçabilité d'un produit.
  const activityRows: ActivityRow[] = missionProjects.flatMap((mp) => {
    if (!mp.target) return []
    return mp.target.activities.map((activity) => ({
      missionId: mp.id,
      missionName: mp.name,
      actorName: mp.target!.actors.find((a) => a.id === activity.actorId)?.name ?? '',
      activity,
    }))
  })
  // Mêmes lignes, enrichies du nom de phase — nécessaire pour comparer des
  // activités ENTRE missions (voir activityDelta.ts), jamais utile avant.
  const activityRowsWithPhase = activityRows.map((r) => {
    const mp = missionProjects.find((p) => p.id === r.missionId)
    return { ...r, phaseName: mp ? phaseNameOf(mp, r.activity) : '' }
  })
  const unspecifiedCount = activityRows.filter((r) => r.activity.traceLinks.length === 0).length
  // Missions dont le lien au produit est trop récent pour avoir déjà été
  // pris en compte dans les SSS/VV (product.pendingImpactReviewMissionIds,
  // ProductsScreen.handleLinkMission) — fait apparaître le bandeau
  // d'analyse d'impact ci-dessous. Résolu par nom via `linkedMissions`
  // (pas missionProjects, pas encore forcément chargé).
  const pendingImpactMissions = linkedMissions.filter((m) => product.pendingImpactReviewMissionIds.includes(m.id))
  // Pour chaque mission en attente d'analyse, le DELTA réel qu'elle
  // apporte : ses activités dont AUCUNE autre mission actuellement liée
  // ne porte déjà l'équivalent (acteur + phase + nom, voir
  // activityDelta.ts) — demande explicite : n'analyser/ne générer que ce
  // qui est réellement nouveau, pas refaire tourner le LLM sur des
  // activités déjà couvertes par une autre mission du même produit.
  const pendingImpactDelta = pendingImpactMissions.map((m) => {
    const ownRows = activityRowsWithPhase.filter((r) => r.missionId === m.id)
    const otherRows = activityRowsWithPhase.filter((r) => r.missionId !== m.id)
    return { missionId: m.id, missionName: m.name, newRows: rowsNotIn(ownRows, otherRows) }
  })
  const pendingImpactDeltaRows = pendingImpactDelta.flatMap((d) => d.newRows)
  // Missions liées dont la variante Cible n'existe pas encore (jamais
  // créée, voir VariantToggle.tsx côté mission) — la cause la plus
  // fréquente d'un bouton "Proposer les SSS…"/"Analyser l'impact" grisé
  // juste après avoir lié une mission toute neuve : activityRows reste
  // VIDE pour elle (seule la Cible participe à la traçabilité, voir le
  // commentaire ci-dessus), donc rien à envoyer au LLM tant qu'elle n'a
  // pas de Cible — signalement explicite ci-dessous plutôt qu'un bouton
  // désactivé sans explication (signalement utilisateur).
  const missionsWithoutTarget = missionProjects.filter((mp) => !mp.target)
  // Spécifications qu'AUCUNE activité Cible des missions ACTUELLEMENT
  // liées ne référence plus — après la déliaison d'une mission
  // (ProductsScreen.handleUnlinkMission), une spécification qui n'était
  // justifiée QUE par ses activités tombe dans ce cas : signalement
  // déterministe (pas un appel LLM, rien de nouveau à générer) à côté de
  // chaque spécification concernée dans le sous-onglet "Spécifications",
  // pour que l'utilisateur juge lui-même si elle reste pertinente. Laissé
  // TEL QUEL (pas restreint au delta ci-dessous) : reste correct quelle
  // que soit l'origine de l'orphelinat, toujours recalculé à chaque rendu.
  const referencedSpecIds = new Set(activityRows.flatMap((r) => r.activity.traceLinks))
  const orphanedSpecIds = new Set(product.specifications.filter((s) => !referencedSpecIds.has(s.id)).map((s) => s.id))
  // Missions récemment DÉLIÉES de ce produit
  // (product.pendingScopeReviewMissionIds, ProductsScreen.
  // handleUnlinkMission) — fait apparaître le bandeau "le périmètre a
  // changé" ci-dessous. Des ID (la mission n'est plus rattachée, mais son
  // Project reste consultable, voir l'effet ci-dessous) : impossible de
  // les résoudre via linkedMissions, qui ne contient que les missions
  // ENCORE liées.
  const pendingScopeReviewIds = product.pendingScopeReviewMissionIds
  const pendingScopeReviewIdsKey = [...pendingScopeReviewIds].sort().join(',')

  // Recharge le Project complet de chaque mission en attente de revue de
  // périmètre — nécessaire pour calculer le delta exact de ce qu'elle
  // apportait (voir pendingScopeDelta ci-dessous) : contrairement aux
  // missions encore liées (missionProjects ci-dessus), celles-ci ne sont
  // plus dans `linkedMissions`. Une mission dont le Project a lui aussi
  // été supprimé depuis (suppression distincte de la déliaison) échoue en
  // silence et disparaît simplement du delta affiché — cas limite accepté,
  // pas critique (le bandeau reste correct pour les autres missions).
  const [scopeReviewMissionProjects, setScopeReviewMissionProjects] = useState<Project[]>([])
  const [loadingScopeReview, setLoadingScopeReview] = useState(false)
  useEffect(() => {
    if (pendingScopeReviewIds.length === 0) {
      setScopeReviewMissionProjects([])
      return
    }
    setLoadingScopeReview(true)
    Promise.all(pendingScopeReviewIds.map((id) => api.getProject(id).catch(() => null)))
      .then((results) => setScopeReviewMissionProjects(results.filter((p): p is Project => p !== null)))
      .finally(() => setLoadingScopeReview(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingScopeReviewIdsKey])

  const scopeReviewRows = scopeReviewMissionProjects.flatMap((mp) => {
    if (!mp.target) return []
    return mp.target.activities.map((activity) => ({
      missionId: mp.id,
      missionName: mp.name,
      actorName: mp.target!.actors.find((a) => a.id === activity.actorId)?.name ?? '',
      phaseName: phaseNameOf(mp, activity),
      activity,
    }))
  })
  // Pour chaque mission déliée en attente de revue, le DELTA réel qu'elle
  // retire : ses activités dont AUCUNE mission ACTUELLEMENT liée ne porte
  // déjà l'équivalent — symétrique de pendingImpactDelta ci-dessus.
  const pendingScopeDelta = scopeReviewMissionProjects.map((mp) => {
    const ownRows = scopeReviewRows.filter((r) => r.missionId === mp.id)
    return { missionId: mp.id, missionName: mp.name, removedRows: rowsNotIn(ownRows, activityRowsWithPhase) }
  })

  async function saveMissionProject(updated: Project) {
    const saved = await api.saveProject(updated)
    setMissionProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
    onMissionsChanged()
    return saved
  }

  const specTypeLabel = (type: SpecificationType) => SPEC_TYPES.find((t) => t.value === type)?.label ?? type
  const filteredSpecs = filterByQuery(product.specifications, specFilter, (s) => [
    s.code,
    s.text,
    specTypeLabel(s.type),
    s.status,
  ])
  const specSuggestions = suggestionsFor(product.specifications, (s) => [s.code, specTypeLabel(s.type)])

  // Partagé par les deux déclencheurs de génération de ce panneau :
  // `handleGenerateSss` (bouton général, TOUTES les activités sans
  // spécification, quelle que soit leur origine) et `handleAnalyzeImpact`
  // (bandeau d'impact, SEULEMENT le delta des missions en attente — voir
  // pendingImpactDelta) — même logique de fusion/sauvegarde, seule la
  // liste d'activités envoyée au LLM change.
  async function generateSss(rows: ActivityRow[]) {
    if (rows.length === 0) return
    setGenerating(true)
    setGenerateError(null)
    setGenerateNotConfigured(false)
    setGenerateRateLimited(false)
    setGenerateInfo(null)
    setMutationError(null)
    try {
      const activityRefs = rows.map((r) => ({ name: r.activity.name, actorName: r.actorName }))
      // Les spécifications déjà rédigées sont transmises comme contexte
      // (existingSpecifications) : le LLM peut alors proposer la RÉVISION
      // de l'une d'elles (revisesCode) plutôt qu'un doublon, quand une
      // activité encore non tracée (souvent celles d'une mission qui vient
      // d'être liée au produit) révèle une variante d'un besoin déjà
      // couvert — voir mergeSpecDraftsAcrossMissions.ts.
      const existingSpecRefs = product.specifications.map((s) => ({ code: s.code, text: s.text }))
      const drafts = await api.generateSpecifications(activityRefs, existingSpecRefs)
      const result = mergeSpecDraftsAcrossMissions(product.specifications, rows, drafts)
      const parts = [`${result.addedCount} SSS proposée${result.addedCount > 1 ? 's' : ''}`]
      if (result.revisedCount > 0) {
        parts.push(
          `${result.revisedCount} SSS existante${result.revisedCount > 1 ? 's' : ''} révisée${result.revisedCount > 1 ? 's' : ''} (repassée${result.revisedCount > 1 ? 's' : ''} en brouillon, à revalider)`,
        )
      }
      if (result.unmatchedActivities.length > 0) {
        parts.push(`${result.unmatchedActivities.length} activité(s) non reconnue(s) : ${result.unmatchedActivities.join(', ')}`)
      }

      // Persiste chaque mission dont au moins une activité a reçu un
      // nouveau lien — comparaison de longueur suffisante : traceLinks
      // n'est jamais que complété ici, jamais retiré. Comparé à `rows`
      // (ce qui a été envoyé), pas à `activityRows` (toutes les missions) :
      // les deux coïncident pour le bouton général, pas pour le bandeau
      // d'impact (delta restreint).
      const changedMissionIds = new Set<string>()
      result.activityRows.forEach((row, i) => {
        if (row.activity.traceLinks.length !== rows[i].activity.traceLinks.length) changedMissionIds.add(row.missionId)
      })
      for (const missionId of changedMissionIds) {
        const mp = missionProjects.find((p) => p.id === missionId)
        if (!mp?.target) continue
        const updatedActivities = mp.target.activities.map((a) => {
          const updatedRow = result.activityRows.find((r) => r.missionId === missionId && r.activity.id === a.id)
          return updatedRow ? updatedRow.activity : a
        })
        await saveMissionProject({ ...mp, target: { ...mp.target, activities: updatedActivities } })
      }

      // Les scénarios de test qui vérifiaient une SSS venant d'être révisée
      // repassent eux aussi en brouillon : leur contenu (étapes écrites
      // pour l'ancien texte) peut ne plus correspondre exactement au texte
      // révisé — signalement visible dans l'onglet "Tests V&V" (le statut
      // "approuvé" y est déjà affiché/éditable), sans tenter de regénérer
      // leur contenu automatiquement (un scénario de test reste un contenu
      // édité à la main, jamais réécrit sans que l'utilisateur ne le
      // demande explicitement).
      let nextTestScenarios: typeof product.testScenarios =
        result.revisedSpecIds.length > 0
          ? product.testScenarios.map((t) =>
              result.revisedSpecIds.includes(t.specificationId) ? { ...t, status: 'draft' } : t,
            )
          : product.testScenarios

      // Génère aussi, dans la foulée, les scénarios de test V&V des SSS
      // qui viennent d'être proposées — inutile d'attendre un second clic
      // dans le sous-onglet "Tests V&V" (même enchaînement que l'ancien
      // SpecificationsPanel.handleGenerateSss, mission-local).
      const newlyAddedSpecs = result.specifications.slice(product.specifications.length)
      if (newlyAddedSpecs.length > 0) {
        try {
          const specRefs = newlyAddedSpecs.map((s) => ({ code: s.code, text: s.text }))
          const testDrafts = await api.generateTestScenarios(specRefs)
          const testResult = mergeTestScenarioDrafts(result.specifications, nextTestScenarios, testDrafts)
          nextTestScenarios = testResult.testScenarios
          parts.push(`${testResult.addedCount} scénario${testResult.addedCount > 1 ? 's' : ''} de test proposé${testResult.addedCount > 1 ? 's' : ''}`)
        } catch (testErr) {
          parts.push(`scénarios de test non générés (${String(testErr)})`)
        }
      }

      // Toute (re)génération — déclenchée depuis le bandeau d'impact ou
      // depuis le bouton habituel — vaut analyse faite : la liste des
      // missions en attente de revue est vidée, qu'une révision ait
      // effectivement été proposée ou non (l'absence de proposition est
      // aussi une réponse : rien à changer).
      onChange({
        ...product,
        specifications: result.specifications,
        testScenarios: nextTestScenarios,
        pendingImpactReviewMissionIds: [],
      })
      setGenerateInfo(parts.join(' — '))
    } catch (e) {
      switch (classifyGenerationError(e)) {
        case 'not-configured':
          setGenerateNotConfigured(true)
          break
        case 'rate-limited':
          setGenerateRateLimited(true)
          break
        default:
          setGenerateError(String(e))
      }
    } finally {
      setGenerating(false)
    }
  }

  // Bouton général "Proposer les SSS…" : TOUTES les activités sans
  // spécification, parmi TOUTES les missions liées au produit — inchangé
  // par rapport à avant ce lot, reste le filet de sécurité qui couvre
  // aussi les trous non liés à une liaison/déliaison récente.
  async function handleGenerateSss() {
    await generateSss(activityRows.filter((r) => r.activity.traceLinks.length === 0))
  }

  // Bandeau d'impact (mission(s) récemment liée(s)) : seulement le DELTA
  // réellement nouveau par rapport aux autres missions déjà liées (voir
  // pendingImpactDelta) — demande explicite, pas le même ensemble que le
  // bouton général ci-dessus.
  async function handleAnalyzeImpact() {
    await generateSss(pendingImpactDeltaRows)
  }

  function addSpec() {
    const spec: Specification = {
      id: newId('spec'),
      code: `SPEC-${String(product.specifications.length + 1).padStart(3, '0')}`,
      type: 'StakeholderNeed',
      text: '',
      status: 'draft',
      priority: 'must',
    }
    onChange({ ...product, specifications: [...product.specifications, spec] })
  }

  function updateSpec(id: string, patch: Partial<Specification>) {
    onChange({ ...product, specifications: product.specifications.map((s) => (s.id === id ? { ...s, ...patch } : s)) })
  }

  // Retire la spécification du produit ET nettoie les liens de
  // traçabilité pendants dans CHAQUE mission liée (sa variante Cible) —
  // contrairement à l'ancien SpecificationsPanel.tsx (une seule mission,
  // un seul objet à mettre à jour dans le même onChange), ce nettoyage
  // touche potentiellement plusieurs missions : sauvegardes directes,
  // best-effort (une mission en échec n'empêche pas le retrait côté
  // produit, déjà fait, ni le nettoyage des autres).
  function removeSpec(id: string) {
    onChange({
      ...product,
      specifications: product.specifications.filter((s) => s.id !== id),
      testScenarios: product.testScenarios.filter((t) => t.specificationId !== id),
    })
    setMutationError(null)
    for (const mp of missionProjects) {
      if (!mp.target || !mp.target.activities.some((a) => a.traceLinks.includes(id))) continue
      const updatedActivities = mp.target.activities.map((a) =>
        a.traceLinks.includes(id) ? { ...a, traceLinks: a.traceLinks.filter((specId) => specId !== id) } : a,
      )
      saveMissionProject({ ...mp, target: { ...mp.target, activities: updatedActivities } }).catch((e) =>
        setMutationError(String(e)),
      )
    }
  }

  // "Ignorer" du bandeau d'impact (pendingImpactReviewMissionIds) : vide la
  // liste sans lancer d'appel IA — l'utilisateur juge l'analyse inutile
  // pour cette mission (ex. elle ne touche aucune activité déjà spécifiée).
  function dismissImpactReview() {
    onChange({ ...product, pendingImpactReviewMissionIds: [] })
  }

  // "Revoir les spécifications" du bandeau de périmètre réduit (déliaison)
  // : ouvre le sous-onglet "Spécifications", où chaque spécification
  // désormais orphaline (orphanedSpecIds) porte un avertissement — et vide
  // la liste d'attente, comme pour le bandeau d'impact ci-dessus (la revue
  // a été ouverte, inutile de la redemander tant qu'aucune autre mission
  // n'est déliée).
  function reviewScope() {
    setSubTab('specifications')
    onChange({ ...product, pendingScopeReviewMissionIds: [] })
  }

  function dismissScopeReview() {
    onChange({ ...product, pendingScopeReviewMissionIds: [] })
  }

  // Mise à jour OPTIMISTE de missionProjects avant même l'envoi (plutôt que
  // d'attendre la réponse de saveMissionProject, voir son commentaire) :
  // la case cochée/décochée est une action ponctuelle d'un clic, pas une
  // frappe continue — sans cet affichage immédiat, la case reviendrait
  // visuellement en arrière le temps de l'aller-retour réseau (sauvegarde
  // directe de CETTE mission, hors de l'autosave débouncée du produit)
  // avant de se recocher d'elle-même une fois la réponse arrivée, un
  // comportement déroutant pour un simple clic. Repli explicite sur l'état
  // précédent si la sauvegarde échoue (mutationError déjà affiché).
  function handleToggleTraceLink(missionId: string, activityId: string, specId: string) {
    const mp = missionProjects.find((p) => p.id === missionId)
    if (!mp?.target) return
    setMutationError(null)
    const updatedActivities = mp.target.activities.map((a) => {
      if (a.id !== activityId) return a
      const linked = a.traceLinks.includes(specId)
      return { ...a, traceLinks: linked ? a.traceLinks.filter((id) => id !== specId) : [...a.traceLinks, specId] }
    })
    const optimistic: Project = { ...mp, target: { ...mp.target, activities: updatedActivities } }
    setMissionProjects((prev) => prev.map((p) => (p.id === missionId ? optimistic : p)))
    api
      .saveProject(optimistic)
      .then((saved) => {
        setMissionProjects((prev) => prev.map((p) => (p.id === saved.id ? saved : p)))
        onMissionsChanged()
      })
      .catch((e) => {
        setMutationError(String(e))
        setMissionProjects((prev) => prev.map((p) => (p.id === missionId ? mp : p)))
      })
  }

  return (
    <div className="editor">
      {!demoMissionProjects && linkedMissions.length === 0 && (
        <p className="placeholder">
          Aucune mission rattachée à ce produit pour l'instant — rattachez-en au moins une (section « Missions
          rattachées », onglet Stratégie) pour générer des spécifications ou utiliser la matrice de traçabilité.
        </p>
      )}
      {pendingImpactMissions.length > 0 && (
        <div className="impact-review-banner">
          <p>
            {pendingImpactMissions.length === 1
              ? `La mission « ${pendingImpactMissions[0].name} » vient d'être liée à ce produit`
              : `${pendingImpactMissions.length} missions viennent d'être liées à ce produit (${pendingImpactMissions.map((m) => m.name).join(', ')})`}{' '}
            —{' '}
            {loadingMissions ? (
              'calcul du delta d’activités en cours…'
            ) : pendingImpactDeltaRows.length === 0 ? (
              "aucune nouvelle activité par rapport aux missions déjà liées, rien à analyser."
            ) : (
              <>
                {pendingImpactDeltaRows.length} nouvelle{pendingImpactDeltaRows.length > 1 ? 's' : ''} activité
                {pendingImpactDeltaRows.length > 1 ? 's' : ''} à analyser : {formatActivityList(pendingImpactDeltaRows)}.
              </>
            )}
          </p>
          <div className="impact-review-banner-actions">
            <button
              type="button"
              className="btn-primary"
              onClick={handleAnalyzeImpact}
              disabled={generating || loadingMissions || pendingImpactDeltaRows.length === 0}
            >
              {generating ? 'Analyse…' : "Analyser l'impact"}
            </button>
            <button type="button" onClick={dismissImpactReview} disabled={generating}>
              Ignorer
            </button>
          </div>
        </div>
      )}
      {pendingScopeReviewIds.length > 0 && (
        <div className="impact-review-banner">
          <p>
            {/* Le COMPTE vient de pendingScopeReviewIds (connu immédiatement,
                voir product.pendingScopeReviewMissionIds) — les NOMS de
                pendingScopeDelta (dérivés d'un fetch par id, voir
                scopeReviewMissionProjects) ne sont ajoutés qu'une fois
                disponibles, pour ne jamais afficher un compte erroné
                pendant le chargement. */}
            {pendingScopeReviewIds.length === 1
              ? `La mission${pendingScopeDelta[0] ? ` « ${pendingScopeDelta[0].missionName} »` : ''} a été retirée de ce produit`
              : `${pendingScopeReviewIds.length} missions ont été retirées de ce produit${pendingScopeDelta.length > 0 ? ` (${pendingScopeDelta.map((d) => d.missionName).join(', ')})` : ''}`}{' '}
            —{' '}
            {loadingScopeReview ? (
              'calcul du delta d’activités en cours…'
            ) : (() => {
              const removedRows = pendingScopeDelta.flatMap((d) => d.removedRows)
              return removedRows.length === 0
                ? 'toutes ses activités restent couvertes par les missions restantes, rien à revoir.'
                : `${removedRows.length} activité${removedRows.length > 1 ? 's' : ''} ne ${removedRows.length > 1 ? 'sont' : 'est'} plus couverte${removedRows.length > 1 ? 's' : ''} : ${formatActivityList(removedRows)}.`
            })()}
          </p>
          <div className="impact-review-banner-actions">
            <button type="button" className="btn-primary" onClick={reviewScope}>
              Revoir les spécifications
            </button>
            <button type="button" onClick={dismissScopeReview}>
              Ignorer
            </button>
          </div>
        </div>
      )}
      {missionsError && <p className="error">{missionsError}</p>}
      {mutationError && <p className="error">{mutationError}</p>}
      {/* Explique pourquoi "Proposer les SSS…"/"Analyser l'impact" sont
          grisés quand il n'y a tout simplement RIEN à envoyer au LLM (zéro
          activité Cible parmi les missions liées) — placé ici (avant les
          sous-onglets, pas dans celui "Spécifications" seulement) pour
          rester visible même si l'utilisateur est sur "Tests V&V" ou
          "Matrice de traçabilité" quand il clique sur le bandeau
          ci-dessus. Signalement utilisateur : le bouton restait grisé
          sans aucune explication juste après avoir lié une mission. */}
      {!loadingMissions && !missionsError && linkedMissions.length > 0 && activityRows.length === 0 && (
        <p className="placeholder">
          {missionsWithoutTarget.length > 0
            ? `Aucune activité Cible disponible pour l'instant : ${missionsWithoutTarget.map((m) => m.name).join(', ')} n'${missionsWithoutTarget.length > 1 ? 'ont' : 'a'} pas encore de variante Cible — ouvrez la mission et cliquez sur « + Créer la cible » pour pouvoir générer des spécifications.`
            : "Les missions liées n'ont pas encore d'activité dans leur variante Cible."}
        </p>
      )}

      <nav className="tabs subtabs">
        <button type="button" className={subTab === 'specifications' ? 'active' : ''} onClick={() => setSubTab('specifications')}>
          Spécifications
        </button>
        <button type="button" className={subTab === 'tests' ? 'active' : ''} onClick={() => setSubTab('tests')}>
          Tests V&V{product.testScenarios.length > 0 ? ` (${product.testScenarios.length})` : ''}
        </button>
        <button type="button" className={subTab === 'matrix' ? 'active' : ''} onClick={() => setSubTab('matrix')}>
          Matrice de traçabilité
          {product.specifications.length > 0
            ? ` (${product.specifications.filter((s) => product.testScenarios.some((t) => t.specificationId === s.id)).length}/${product.specifications.length} couvertes)`
            : ''}
        </button>
      </nav>

      {subTab === 'specifications' && (
        <section>
          <div className="nl-actions">
            <button
              type="button"
              className={`btn-primary${generating ? ' btn-loading' : ''}`}
              onClick={handleGenerateSss}
              disabled={generating || unspecifiedCount === 0 || loadingMissions}
            >
              {generating ? (
                <>
                  <Spinner /> Génération…
                </>
              ) : (
                `Proposer les SSS pour les activités sans spécification (IA)${unspecifiedCount > 0 ? ` (${unspecifiedCount})` : ''}`
              )}
            </button>
          </div>
          {generateNotConfigured && (
            <div className="nl-warning">
              Génération indisponible : aucune clé API n'est configurée. Ouvrez <strong>Paramètres</strong> en bas
              de la barre latérale pour en saisir une, ou ajoutez les spécifications manuellement ci-dessous.
            </div>
          )}
          {generateRateLimited && (
            <div className="nl-warning">
              Le fournisseur LLM limite temporairement le nombre d'appels (429) — réessayez dans quelques instants,
              ou changez de fournisseur depuis <strong>Paramètres</strong> si cela persiste.
            </div>
          )}
          {!generateNotConfigured && !generateInfo && unspecifiedCount === 0 && activityRows.length > 0 && (
            <p className="generate-info">Toutes les activités (Cible) des missions liées ont déjà une spécification liée.</p>
          )}
          {generateError && <p className="error">{generateError}</p>}
          {generateInfo && <p className="generate-info">{generateInfo}</p>}

          {product.specifications.length > FILTER_THRESHOLD && (
            <ListFilterInput
              value={specFilter}
              onChange={setSpecFilter}
              placeholder="Rechercher une spécification…"
              suggestions={specSuggestions}
            />
          )}
          <ul className="spec-list">
            {filteredSpecs.length === 0 && specFilter.trim() && (
              <li className="empty">Aucune spécification ne correspond à « {specFilter} ».</li>
            )}
            {filteredSpecs.map((spec) => (
              <li key={spec.id} className="spec-card">
                <div className="spec-card-meta">
                  <input
                    className="spec-code"
                    value={spec.code}
                    onChange={(e) => updateSpec(spec.id, { code: e.target.value })}
                  />
                  <select value={spec.type} onChange={(e) => updateSpec(spec.id, { type: e.target.value as SpecificationType })}>
                    {SPEC_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <select value={spec.parentId ?? ''} onChange={(e) => updateSpec(spec.id, { parentId: e.target.value || undefined })}>
                    <option value="">— sans parent —</option>
                    {product.specifications
                      .filter((s) => s.id !== spec.id)
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code}
                        </option>
                      ))}
                  </select>
                  <select
                    className="status-select"
                    data-status={spec.status}
                    value={spec.status}
                    onChange={(e) => updateSpec(spec.id, { status: e.target.value as Specification['status'] })}
                  >
                    <option value="draft">brouillon</option>
                    <option value="approved">approuvée</option>
                    <option value="deprecated">obsolète</option>
                  </select>
                  <button type="button" className="danger" onClick={() => removeSpec(spec.id)}>
                    supprimer
                  </button>
                </div>
                <textarea
                  className="spec-text"
                  rows={2}
                  placeholder="Texte de l'exigence"
                  value={spec.text}
                  onChange={(e) => updateSpec(spec.id, { text: e.target.value })}
                />
                {spec.rationale && (
                  <textarea
                    className="spec-rationale"
                    rows={1}
                    placeholder="Justification"
                    value={spec.rationale}
                    onChange={(e) => updateSpec(spec.id, { rationale: e.target.value })}
                  />
                )}
                {!loadingMissions && linkedMissions.length > 0 && orphanedSpecIds.has(spec.id) && (
                  <p className="spec-orphan-warning">
                    Non reliée à une activité (Cible) d'une mission actuellement rattachée — vérifiez si elle reste
                    pertinente (une mission qui la justifiait a peut-être été déliée).
                  </p>
                )}
              </li>
            ))}
            {product.specifications.length === 0 && <li className="empty">Aucune spécification pour l'instant.</li>}
          </ul>
          <button type="button" onClick={addSpec}>
            + Ajouter une spécification
          </button>
        </section>
      )}

      {subTab === 'tests' && (
        <TestScenariosPanel
          specifications={product.specifications}
          testScenarios={product.testScenarios}
          onTestScenariosChange={(testScenarios) => onChange({ ...product, testScenarios })}
        />
      )}

      {subTab === 'matrix' && (
        <section>
          {loadingMissions ? (
            <p>Chargement des missions…</p>
          ) : (
            <TraceabilityMatrix
              specifications={product.specifications}
              testScenarios={product.testScenarios}
              activityRows={activityRows}
              onToggle={handleToggleTraceLink}
            />
          )}
        </section>
      )}
    </div>
  )
}
