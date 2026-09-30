import { enqueueIsochrone, type IsochroneParams } from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneRequest extends IsochroneParams {
  scenario_slug: string
}

export function fetchIsochrone(request: IsochroneRequest): Promise<ChainResponse> {
  return enqueueIsochrone('/api/isochrone', request)
}
