import { useEffect, useRef, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Target, TriangleAlert } from 'lucide-react'
import type { Product, Project } from '../../api/types'
import { formatKpiValue } from '../products/kpiTree'

interface Props {
  project: Project
  actorId: string
  // Produit associé à CETTE mission (Project.productId), résolu par
  // ActorView.tsx/ActorMissionsScreen.tsx — undefined si aucun (état
  // explicite, comme KpiLinksSection.tsx : le bloc "Valeur apportée" et
  // les chips KPI par activité sont alors simplement absents, jamais une
  // erreur). Angle "Produit → Persona" du plan Produit/KPI/Missions :
  // exprime la VALEUR (cadrage actuel → cible, voir formatKpiValue)
  // gagnée par cette persona grâce au produit, pas seulement une
  // traçabilité de noms.
  product?: Product
}

// Rendu détaillé d'un acteur donné au sein d'un projet : résumé (nombre
// d'activités, alertes) puis timeline par phase (activités, interactions,
// spécifications/tests liés). Extrait de ActorView.tsx (qui ajoute la
// sélection par chips au sein d'un seul projet) pour être réutilisé tel
// quel par l'écran transverse "Acteurs" (ActorMissionsScreen.tsx), qui
// l'affiche une fois par mission où l'acteur sélectionné apparaît.
export function ActorDetail({ project, actorId, product }: Props) {
  // Ombres de bord de la timeline (voir plus bas, .actor-timeline-fade) :
  // affichées seulement là où il reste vraiment du contenu hors champ,
  // recalculé à chaque défilement/redimensionnement — jamais un simple
  // repère permanent qui mentirait une fois arrivé au bout. Les hooks
  // doivent rester avant le "return null" ci-dessous (règle des hooks),
  // d'où leur position avant la résolution de `actor`.
  const timelineRef = useRef<HTMLDivElement>(null)
  const [scrollFades, setScrollFades] = useState({ left: false, right: false })

  useEffect(() => {
    const el = timelineRef.current
    if (!el) return
    function update() {
      if (!el) return
      setScrollFades({
        left: el.scrollLeft > 1,
        right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1,
      })
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', update)
      observer.disconnect()
    }
  }, [project, actorId])

  const actor = project.actors.find((a) => a.id === actorId)
  if (!actor) return null

  const phases = [...project.phases].sort((a, b) => a.order - b.order)
  const actorActivities = project.activities
    .filter((a) => a.actorId === actor.id)
    .sort((a, b) => a.order - b.order)

  const activityById = new Map(project.activities.map((a) => [a.id, a]))
  const actorNameOf = (activityId: string) => {
    const act = activityById.get(activityId)
    return act ? project.actors.find((x) => x.id === act.actorId)?.name : undefined
  }

  const isolatedCount = actorActivities.filter(
    (act) =>
      !project.interactions.some((i) => i.fromActivityId === act.id) &&
      !project.interactions.some((i) => i.toActivityId === act.id),
  ).length
  const noSpecCount = actorActivities.filter((act) => act.traceLinks.length === 0).length
  // Une activité "sans test" a au moins une spécification liée, mais
  // aucune d'elles n'est vérifiée par un scénario de test — distinct de
  // noSpecCount, qui n'a même pas de spécification à tester.
  const noTestCount = actorActivities.filter(
    (act) =>
      act.traceLinks.length > 0 &&
      !project.testScenarios.some((t) => act.traceLinks.includes(t.specificationId)),
  ).length

  // Angle "Produit → Persona" (plan Produit/KPI/Missions) : KPI DÉDUPLIQUÉS
  // touchés par au moins une activité de cette persona dans cette mission
  // — un id qui ne correspond plus à aucun KPI du produit (supprimé
  // entretemps) est ici simplement omis plutôt qu'affiché
  // "(KPI supprimé)" comme au niveau de chaque activité ci-dessous : ce
  // bloc est un récit de valeur, pas une liste de traçabilité à
  // assainir.
  const kpiIds = [...new Set(actorActivities.flatMap((act) => act.kpiLinks))]
  const contributedKpis = product ? kpiIds.map((id) => product.kpis.find((k) => k.id === id)).filter((k): k is NonNullable<typeof k> => Boolean(k)) : []

  return (
    <>
      <div className="actor-summary">
        <strong>{actorActivities.length}</strong> activité{actorActivities.length > 1 ? 's' : ''}
        {' · '}
        <span className={isolatedCount > 0 ? 'summary-warn' : ''}>{isolatedCount} sans interaction</span>
        {' · '}
        <span className={noSpecCount > 0 ? 'summary-warn' : ''}>{noSpecCount} sans spécification liée</span>
        {' · '}
        <span className={noTestCount > 0 ? 'summary-warn' : ''}>{noTestCount} sans test lié</span>
      </div>

      {product && contributedKpis.length > 0 && (
        <div className="actor-kpi-value">
          <h3>
            <Target size={14} aria-hidden="true" /> Valeur apportée par {product.name}
          </h3>
          <ul className="actor-kpi-value-list">
            {contributedKpis.map((kpi) => {
              const value = formatKpiValue(kpi)
              return (
                <li key={kpi.id}>
                  <span className="actor-kpi-value-name">{kpi.name || '(sans nom)'}</span>
                  {value && <span className="actor-kpi-value-target">{value}</span>}
                  {kpi.pillar && <span className="actor-kpi-value-pillar">{kpi.pillar}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Enveloppe non scrollable portant les ombres de bord (voir
          .actor-timeline-fade, App.css) : contrairement à un fond en
          dégradé posé directement sur .actor-timeline (défilant, donc
          masqué dès qu'une carte opaque se trouve pile au bord), ces
          calques restent fixés aux bords gauche/droit indépendamment du
          défilement — seul moyen fiable de signaler qu'il reste des
          phases hors champ quand le nombre de phases dépasse la largeur
          de l'écran (mesuré : largeur de contenu près du double de la
          largeur visible sur un blueprint réaliste, sans aucun repère
          visuel avant ce correctif). N'apparaissent que du côté où il
          reste effectivement du contenu (scrollFades, recalculé au
          défilement/redimensionnement) : jamais un repère qui mentirait
          une fois arrivé au bout. */}
      <div className="actor-timeline-wrap">
        {scrollFades.left && <div className="actor-timeline-fade actor-timeline-fade-left" aria-hidden="true" />}
        {scrollFades.right && <div className="actor-timeline-fade actor-timeline-fade-right" aria-hidden="true" />}
        <div className="actor-timeline" ref={timelineRef}>
        {phases.map((phase) => {
          const activities = actorActivities.filter((a) => a.phaseId === phase.id)
          return (
            <div key={phase.id} className="actor-phase-column">
              <h3>{phase.name}</h3>
              {activities.length === 0 && <p className="actor-phase-empty">— aucune activité —</p>}
              {activities.map((act) => {
                const incoming = project.interactions.filter((i) => i.toActivityId === act.id)
                const outgoing = project.interactions.filter((i) => i.fromActivityId === act.id)
                const isolated = incoming.length === 0 && outgoing.length === 0
                const specs = act.traceLinks
                  .map((id) => project.specifications.find((s) => s.id === id))
                  .filter((s): s is NonNullable<typeof s> => Boolean(s))
                // Scénarios de test vérifiant l'une des spécifications de
                // cette activité (une spécification peut avoir plusieurs
                // scénarios, d'où le dédoublonnage par id).
                const specIds = new Set(specs.map((s) => s.id))
                const tests = [...new Map(
                  project.testScenarios.filter((t) => specIds.has(t.specificationId)).map((t) => [t.id, t]),
                ).values()]

                return (
                  <div key={act.id} className={`actor-activity-card${isolated ? ' isolated' : ''}`}>
                    <div className="actor-activity-title">{act.name}</div>
                    {act.description && <p className="actor-activity-desc">{act.description}</p>}
                    {act.painPoints.length > 0 && (
                      <ul className="actor-pain-points">
                        {act.painPoints.map((p) => (
                          <li key={p.id}>
                            <TriangleAlert size={13} aria-hidden="true" /> {p.text}
                          </li>
                        ))}
                      </ul>
                    )}

                    {/* "Reçoit"/"Envoie" en toutes lettres plutôt qu'un
                        simple glyphe ←/→ (trop cryptique pour qui découvre
                        l'écran — trouvé lors de l'audit UX/UI, ADR-068) :
                        l'icône reprend le sens de la flèche, le mot lève
                        l'ambiguïté sans avoir à la déduire. */}
                    {incoming.length > 0 && (
                      <ul className="actor-io actor-io-in">
                        {incoming.map((i) => (
                          <li key={i.id}>
                            <ArrowDownLeft size={13} aria-hidden="true" />
                            <span className="actor-io-label">Reçoit :</span> {i.information}
                            {actorNameOf(i.fromActivityId) && <span className="actor-io-from"> ({actorNameOf(i.fromActivityId)})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {outgoing.length > 0 && (
                      <ul className="actor-io actor-io-out">
                        {outgoing.map((i) => (
                          <li key={i.id}>
                            <ArrowUpRight size={13} aria-hidden="true" />
                            <span className="actor-io-label">Envoie :</span> {i.information}
                            {actorNameOf(i.toActivityId) && <span className="actor-io-from"> ({actorNameOf(i.toActivityId)})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {isolated && <p className="actor-warning">Aucune interaction : activité isolée du processus.</p>}

                    {specs.length > 0 ? (
                      <div className="actor-specs">
                        {specs.map((s) => (
                          <span key={s.id} className="spec-chip" title={s.text}>
                            {s.code}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="actor-warning">Aucune spécification liée.</p>
                    )}

                    {specs.length > 0 &&
                      (tests.length > 0 ? (
                        <div className="actor-tests">
                          {tests.map((t) => (
                            <span key={t.id} className="test-chip" title={t.title}>
                              {t.code}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="actor-warning">Aucun test lié.</p>
                      ))}

                    {product && act.kpiLinks.length > 0 && (
                      <div className="actor-kpis">
                        {act.kpiLinks.map((id) => {
                          const kpi = product.kpis.find((k) => k.id === id)
                          const value = kpi ? formatKpiValue(kpi) : ''
                          return (
                            <span key={id} className="kpi-chip">
                              {kpi ? kpi.name || '(sans nom)' : '(KPI supprimé)'}
                              {value && ` — ${value}`}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })}
        </div>
      </div>
    </>
  )
}
