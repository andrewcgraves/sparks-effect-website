export interface Route {
  id: string
  scenario_id: string
  name: string
  mode: string
  geometry: { type: 'LineString'; coordinates: number[][] }
  bidirectional: boolean
}

export interface Station {
  id: string
  scenario_id: string
  slug: string
  name: string
  location: { type: 'Point'; coordinates: [number, number] }
  platform_height: number
}

function apiBase(): string {
  return import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080'
}

export async function fetchScenarioRoutes(scenarioSlug: string): Promise<Route[]> {
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}/routes`)
  if (!res.ok) throw new Error(`Failed to fetch routes for ${scenarioSlug}: ${res.status}`)
  return res.json() as Promise<Route[]>
}

export async function fetchScenarioStations(scenarioSlug: string): Promise<Station[]> {
  const res = await fetch(`${apiBase()}/api/scenarios/${scenarioSlug}/stations`)
  if (!res.ok) throw new Error(`Failed to fetch stations for ${scenarioSlug}: ${res.status}`)
  return res.json() as Promise<Station[]>
}
