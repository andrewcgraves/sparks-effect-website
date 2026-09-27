import { apiRequest } from './authoring/client'
import { enqueueIsochrone } from './routingJobs'
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

// Both are public: the answer depends on the slug alone, and a 404 means
// unpublished or unknown without saying which (ADR-0005 in sparks-effect-api).
export async function fetchServicePublication(slug: string): Promise<ServicePublication> {
  return apiRequest<ServicePublication>(`/api/services/${slug}/publication`)
}

export interface PublishedServiceSummary {
  slug: string
  name: string
  subtext?: string
  description?: string
}

// Most recently published first. Unpublished services never appear, for any
// caller, owner included.
export function listPublishedServices(): Promise<PublishedServiceSummary[]> {
  return apiRequest<PublishedServiceSummary[]>('/api/published-services')
}

export function fetchPublicationIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/services/${slug}/publication/isochrone`, request)
}
