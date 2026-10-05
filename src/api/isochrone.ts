import { enqueueIsochrone, type IsochroneParams, type IsochroneProgress } from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneRequest extends IsochroneParams {
  scenario_slug: string
}

export function fetchIsochrone(
  request: IsochroneRequest,
  onProgress?: (progress: IsochroneProgress) => void,
): Promise<ChainResponse> {
  return enqueueIsochrone('/api/isochrone', request, onProgress)
}
