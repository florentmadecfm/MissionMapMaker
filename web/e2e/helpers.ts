import type { Page } from '@playwright/test'

// Base URL de l'API — le webServer de playwright.config.ts écoute sur ce
// port avec des données isolées (MMM_DATA_DIR, un dossier temporaire OS
// par run) : ces appels directs ne touchent jamais /data (données
// réelles) ni n'entrent en conflit avec un autre run.
export const API_BASE = 'http://localhost:8080/api'

// Nom unique par appel — chaque test nettoie ses propres données en fin
// de run (voir chaque spec), mais un suffixe aléatoire évite toute
// collision si un nettoyage précédent a échoué.
export function uniqueName(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} : ${await res.text()}`)
  return res.json() as Promise<T>
}

export async function apiCreateProject(name: string): Promise<any> {
  const res = await fetch(`${API_BASE}/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return json(res)
}

export async function apiSaveProject(project: any): Promise<any> {
  const res = await fetch(`${API_BASE}/projects/${project.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  })
  return json(res)
}

export async function apiGetProject(id: string): Promise<any> {
  return json(await fetch(`${API_BASE}/projects/${id}`))
}

export async function apiDeleteProject(id: string): Promise<void> {
  await fetch(`${API_BASE}/projects/${id}`, { method: 'DELETE' })
}

export async function apiCreateProduct(name: string): Promise<any> {
  const res = await fetch(`${API_BASE}/products`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
  return json(res)
}

export async function apiSaveProduct(product: any): Promise<any> {
  const res = await fetch(`${API_BASE}/products/${product.id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(product),
  })
  return json(res)
}

export async function apiDeleteProduct(id: string): Promise<void> {
  await fetch(`${API_BASE}/products/${id}`, { method: 'DELETE' })
}

// Pré-seed le drapeau de visite guidée (voir WelcomeTour.tsx/
// ProjectShell.tsx) : sans lui, le premier chargement d'un navigateur
// frais ouvre la visite guidée par-dessus tout le reste et bloque le
// clic sur la vraie liste de missions (piège déjà rencontré pendant le
// développement de ce projet — voir ADR sur la visite guidée). À
// appeler avant page.goto.
export async function seedTourSeen(page: Page): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('mmm-welcome-tour-seen', '1'))
}

export async function gotoHome(page: Page): Promise<void> {
  await seedTourSeen(page)
  await page.goto('/')
  await page.waitForSelector('.project-list button, .new-project input', { timeout: 10000 })
}

export async function openMission(page: Page, name: string): Promise<void> {
  await gotoHome(page)
  await page.locator('.project-list button', { hasText: name }).click()
  await page.waitForSelector('.tabs-bar', { timeout: 10000 })
}
