import { ApiError } from './authoring/client'
import { enqueueIsochrone, type IsochroneParams } from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneRequest extends IsochroneParams {
  scenario_slug: string
}

export class IsochroneApiError extends Error {
  readonly status: number

  constructor(status: number, options?: { cause?: unknown }) {
    super(`Isochrone API error: ${status}`, options)
    this.name = 'IsochroneApiError'
    this.status = status
  }
}

export async function fetchIsochrone(request: IsochroneRequest): Promise<ChainResponse> {
  try {
    return await enqueueIsochrone('/api/isochrone', request)
  } catch (err) {
    // Either half of the request can be rejected — the enqueue or a poll — and
    // both are this request failing, so both are reported the same way. The
    // shared API client speaks ApiError; callers here have only ever had a
    // case for IsochroneApiError.
    if (err instanceof ApiError) throw new IsochroneApiError(err.status, { cause: err })
    throw err
  }
}
