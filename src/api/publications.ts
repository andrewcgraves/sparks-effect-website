import { apiRequest } from './authoring/client'
import { enqueueIsochrone, type IsochroneProgress } from './routingJobs'
import type { ChainResponse } from '../fixtures/isochrone'
import type { AuthoredIsochroneRequest, Route, TransitGraph } from './authoring/types'

// The graph arrives flat beside the snapshot, exactly as GET
// /api/services/{slug}/graph serves it, so anything that draws a compiled graph
// draws a publication unchanged.
export interface ServicePublication extends TransitGraph {
  user_service_id: string
  compile_job_id: string
  name: string
  subtext?: string
  description?: string
  routes: Route[]
  published_at: string
}

// What publishing answers with: the snapshot without the graph it pins.
export type PublicationSnapshot = Pick<
  ServicePublication,
  'user_service_id' | 'compile_job_id' | 'name' | 'subtext' | 'description' | 'routes' | 'published_at'
>

// Both are public: the answer depends on the slug alone, and a 404 means
// unpublished or unknown without saying which (ADR-0005 in sparks-effect-api).
export async function fetchServicePublication(slug: string): Promise<ServicePublication> {
  return apiRequest<ServicePublication>(`/api/services/${slug}/publication`)
}

export function fetchPublicationIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
  onProgress?: (progress: IsochroneProgress) => void,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/services/${slug}/publication/isochrone`, request, onProgress)
}

// Owner-only. Publishing never compiles: it pins the latest compile, and answers
// 409 stale_graph when there is none current against the draft.
export async function publishService(slug: string): Promise<PublicationSnapshot> {
  return apiRequest<PublicationSnapshot>(`/api/services/${slug}/publication`, { method: 'PUT' })
}

// 204 whether or not it was published.
export async function unpublishService(slug: string): Promise<void> {
  await apiRequest<void>(`/api/services/${slug}/publication`, { method: 'DELETE' })
}
