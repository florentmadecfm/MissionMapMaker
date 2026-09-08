import { useState } from 'react'
import type { Project } from '../../api/types'

interface Props {
  project: Project
}

export function ActorView({ project }: Props) {
  const [actorId, setActorId] = useState<string | null>(project.actors[0]?.id ?? null)

  if (project.actors.length === 0) {
    return <p className="placeholder">Ajoutez au moins un acteur pour voir cette vue.</p>
  }

  const actor = project.actors.find((a) => a.id === actorId) ?? project.actors[0]
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

  return (
    <div className="actor-view">
      <nav className="actor-chips">
        {project.actors.map((a) => (
          <button
            key={a.id}
            type="button"
            className={`actor-chip${a.id === actor.id ? ' active' : ''}`}
            style={{ borderColor: a.color }}
            onClick={() => setActorId(a.id)}
          >
            <span className="actor-dot" style={{ background: a.color }} />
            {a.name}
          </button>
        ))}
      </nav>

      <div className="actor-summary">
        <strong>{actorActivities.length}</strong> activité{actorActivities.length > 1 ? 's' : ''}
        {' · '}
        <span className={isolatedCount > 0 ? 'summary-warn' : ''}>{isolatedCount} sans interaction</span>
        {' · '}
        <span className={noSpecCount > 0 ? 'summary-warn' : ''}>{noSpecCount} sans spécification liée</span>
        {' · '}
        <span className={noTestCount > 0 ? 'summary-warn' : ''}>{noTestCount} sans test lié</span>
      </div>

      <div className="actor-timeline">
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

                    {incoming.length > 0 && (
                      <ul className="actor-io actor-io-in">
                        {incoming.map((i) => (
                          <li key={i.id}>
                            ← {i.information}
                            {actorNameOf(i.fromActivityId) && <span className="actor-io-from"> ({actorNameOf(i.fromActivityId)})</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                    {outgoing.length > 0 && (
                      <ul className="actor-io actor-io-out">
                        {outgoing.map((i) => (
                          <li key={i.id}>
                            → {i.information}
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
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
