import { apiRequest } from './authoring/client'

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
