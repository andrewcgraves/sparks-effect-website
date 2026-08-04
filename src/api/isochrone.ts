import { ApiError } from './authoring/client'
import { enqueueIsochrone, type IsochroneParams } from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

// The seeded isochrone names its scenario in the body; the authored endpoints
// name their target in the URL instead.
export interface IsochroneRequest extends IsochroneParams {
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
  try {
    return await enqueueIsochrone('/api/isochrone', request)
  } catch (err) {
    // Either half of the request can be rejected — the enqueue or a poll — and
    // both are this request failing, so both are reported the same way. The
    // shared API client speaks ApiError; callers here have only ever had a
    // case for IsochroneApiError.
    if (err instanceof ApiError) throw new IsochroneApiError(err.status)
    throw err
  }
}
