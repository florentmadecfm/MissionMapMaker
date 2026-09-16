import type {
  ActivityRef,
  ActorSummary,
  DraftPainPointSolution,
  DraftProcess,
  DraftSpecification,
  DraftTestScenario,
  PainPointContext,
  PainPointResolution,
  Project,
  ProjectSummary,
  ProjectVersion,
  PromptSettings,
  PromptSettingsResponse,
  Provider,
  Settings,
  SpecRef,
} from './types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error ?? `HTTP ${res.status}`)
  }
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// Filet de sécurité côté client, en écho à domain.Project.Normalize côté
// serveur : un backend pas encore redémarré après un déploiement (donc
// servant une version antérieure à un champ collection récent, ex.
// testScenarios) renverrait ce champ absent plutôt que vide, ce qui ferait
// planter tout composant qui suppose toujours un tableau — arrivé en
// pratique (voir ADR-022). On complète ici par une valeur vide plutôt que
// de faire confiance à la forme exacte de la réponse réseau.
function normalizeProject(project: Project): Project {
  return {
    ...project,
    actors: (project.actors ?? []).map((a) => ({
      ...a,
      about: a.about ?? '',
      bio: a.bio ?? '',
      goals: a.goals ?? [],
      painPoints: a.painPoints ?? [],
      backstage: a.backstage ?? false,
    })),
    phases: project.phases ?? [],
    activities: (project.activities ?? []).map((a) => ({
      ...a,
      offsetX: a.offsetX ?? 0,
      offsetY: a.offsetY ?? 0,
      userStories: a.userStories ?? [],
      traceLinks: a.traceLinks ?? [],
      painPoints: a.painPoints ?? [],
    })),
    interactions: project.interactions ?? [],
    specifications: project.specifications ?? [],
    testScenarios: (project.testScenarios ?? []).map((t) => ({ ...t, steps: t.steps ?? [] })),
  }
}

export const api = {
  listProjects: () => request<ProjectSummary[]>('/projects'),
  listActors: () => request<ActorSummary[]>('/actors'),
  createProject: (name: string) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name }) }).then(normalizeProject),
  getProject: (id: string) => request<Project>(`/projects/${id}`).then(normalizeProject),
  saveProject: (project: Project) =>
    request<Project>(`/projects/${project.id}`, { method: 'PUT', body: JSON.stringify(project) }).then(normalizeProject),
  deleteProject: (id: string) => request<void>(`/projects/${id}`, { method: 'DELETE' }),
  listVersions: (id: string) => request<ProjectVersion[]>(`/projects/${id}/versions`),
  getVersion: (id: string, versionId: string) =>
    request<Project>(`/projects/${id}/versions/${versionId}`).then(normalizeProject),
  restoreVersion: (id: string, versionId: string) =>
    request<Project>(`/projects/${id}/versions/${versionId}/restore`, { method: 'POST' }).then(normalizeProject),
  generateFromText: (text: string) =>
    request<DraftProcess>('/generate', { method: 'POST', body: JSON.stringify({ text }) }),
  generateSpecifications: (activities: ActivityRef[]) =>
    request<DraftSpecification[]>('/generate-specifications', {
      method: 'POST',
      body: JSON.stringify({ activities }),
    }),
  generateTestScenarios: (specifications: SpecRef[]) =>
    request<DraftTestScenario[]>('/generate-test-scenarios', {
      method: 'POST',
      body: JSON.stringify({ specifications }),
    }),
  // ADR-066 : flux en 2 temps de résolution d'un point de friction — 5
  // propositions de solutions structurelles, puis (une fois l'une d'elles
  // choisie) la SSS + le scénario de test correspondant.
  generatePainPointSolutions: (context: PainPointContext) =>
    request<DraftPainPointSolution[]>('/generate-painpoint-solutions', {
      method: 'POST',
      body: JSON.stringify(context),
    }),
  generatePainPointResolution: (context: PainPointContext, chosenSolution: DraftPainPointSolution) =>
    request<PainPointResolution>('/generate-painpoint-resolution', {
      method: 'POST',
      body: JSON.stringify({ ...context, chosenSolution }),
    }),
  getSettings: () => request<Settings>('/settings'),
  saveApiKey: (provider: Provider, apiKey: string, model?: string, baseUrl?: string) =>
    request<Settings>('/settings', { method: 'PUT', body: JSON.stringify({ provider, apiKey, model, baseUrl }) }),
  clearApiKey: () => request<void>('/settings', { method: 'DELETE' }),
  getPrompts: () => request<PromptSettingsResponse>('/settings/prompts'),
  savePrompts: (prompts: PromptSettings) =>
    request<PromptSettingsResponse>('/settings/prompts', { method: 'PUT', body: JSON.stringify(prompts) }),
  // Génération d'image (ADR-073) : clé API Mistral dédiée, indépendante de
  // celle ci-dessus (génération de texte) — voir SettingsModal.tsx.
  saveImageGenerationApiKey: (apiKey: string) =>
    request<{ imageGenerationConfigured: boolean }>('/settings/image-generation', {
      method: 'PUT',
      body: JSON.stringify({ apiKey }),
    }),
  clearImageGenerationApiKey: () => request<void>('/settings/image-generation', { method: 'DELETE' }),
  generatePersonaPortrait: (context: { name: string; about: string; bio: string; goals: string[]; painPoints: string[] }) =>
    request<{ imageDataUrl: string }>('/generate-persona-portrait', { method: 'POST', body: JSON.stringify(context) }),
  generateDiagramSketch: (context: {
    missionName: string
    actorNames: string[]
    phaseNames: string[]
    activityNames: string[]
  }) => request<{ imageDataUrl: string }>('/generate-diagram-sketch', { method: 'POST', body: JSON.stringify(context) }),
}
