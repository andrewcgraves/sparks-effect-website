import { apiBase, ApiError } from './authoring/client'
import { awaitIsochrone, type RoutingJob } from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneRequest {
  lat: number
  lng: number
  budget_mins: number
  mode: 'walk' | 'bike' | 'drive'
  scenario_slug: string
}

/**
 * Thrown when the isochrone API responds with a non-ok status. Carries the HTTP
 * status so callers can distinguish server rejections from connectivity failures
 * (which surface as the underlying fetch error, not an IsochroneApiError).
 */
export class IsochroneApiError extends Error {
  readonly status: number

  constructor(status: number) {
    super(`Isochrone API error: ${status}`)
    this.name = 'IsochroneApiError'
    this.status = status
  }
}

/**
 * Requests the seeded isochrone and resolves with the chain once it is plotted.
 *
 * Since SPA-182 the endpoint answers 202 with a routing job rather than a
 * result — the plotting happens in a worker inside the home cluster, which is
 * the only place Valhalla is reachable from. The enqueue-then-poll is hidden
 * here on purpose: this still resolves with a ChainResponse or throws, so the
 * composable, form, and map layer above are unchanged and go on treating an
 * isochrone as one request that eventually answers.
 */
export async function fetchIsochrone(request: IsochroneRequest): Promise<ChainResponse> {
  const response = await fetch(`${apiBase()}/api/isochrone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  })
  if (!response.ok) {
    throw new IsochroneApiError(response.status)
  }

  const job = (await response.json()) as RoutingJob
  try {
    return await awaitIsochrone(job)
  } catch (err) {
    // A rejected poll is this request failing, so it is reported as one. The
    // poll goes through the shared API client, which speaks ApiError; callers
    // here have only ever had a case for IsochroneApiError.
    if (err instanceof ApiError) throw new IsochroneApiError(err.status)
    throw err
  }
}
