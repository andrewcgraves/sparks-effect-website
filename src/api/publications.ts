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

export interface PublishedServiceSummary {
  slug: string
  name: string
  subtext?: string
  description?: string
}

export interface PublishedServicePage {
  items: PublishedServiceSummary[]
  next_cursor: string | null
}

// By first publication, newest first; republishing keeps a service's place, so
// following next_cursor reaches every service once. Unpublished services never
// appear, for any caller, owner included.
//
// cursor is always sent, empty for the first page: without it or limit the API
// answers the bare array it kept for websites built before SPA-434. Leaving
// limit out takes the API's default of 50; it caps any limit at 100.
export async function listPublishedServices(
  page: { cursor?: string; limit?: number } = {},
): Promise<PublishedServicePage> {
  const params = new URLSearchParams({ cursor: page.cursor ?? '' })
  if (page.limit !== undefined) params.set('limit', String(page.limit))
  const body = await apiRequest<PublishedServicePage | PublishedServiceSummary[]>(
    `/api/published-services?${params}`,
  )
  // An API older than SPA-434 ignores cursor and sends everything as an array,
  // which is a last page. Drop this with the API's bare form.
  return Array.isArray(body) ? { items: body, next_cursor: null } : body
}

export function fetchPublicationIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/services/${slug}/publication/isochrone`, request)
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
