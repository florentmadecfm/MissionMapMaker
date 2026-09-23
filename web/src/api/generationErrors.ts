// Classe une erreur d'appel de génération assistée (tous les endpoints
// /api/generate*) en 3 catégories, à partir du message renvoyé par
// api/client.ts (voir request<T>, qui propage body.error tel quel) —
// texte plutôt que code HTTP : chaque écran appelant capture déjà
// l'erreur via `catch (e) { String(e) }`, et le message correspond
// directement aux sentinelles llm.ErrNotConfigured/llm.ErrRateLimited
// (internal/llm/generator.go), traduites en 503/429 côté routeur
// (writeGenerateError, internal/api/router.go) mais réduites ici à leur
// texte pour rester cohérent avec le patron déjà en place (message.includes
// (...), utilisé pour 'not-configured' bien avant l'ajout de
// 'rate-limited').
export type GenerationErrorKind = 'not-configured' | 'rate-limited' | 'other'

export function classifyGenerationError(e: unknown): GenerationErrorKind {
  const message = String(e)
  if (message.includes('clé API non configurée')) return 'not-configured'
  if (message.includes('limite de débit atteinte')) return 'rate-limited'
  return 'other'
}
