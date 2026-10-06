import { apiRequest } from './authoring/client'

const ROUTING_STATUSES = ['ok', 'degraded', 'offline'] as const

export type RoutingStatus = (typeof ROUTING_STATUSES)[number]

export async function fetchRoutingStatus(init?: RequestInit): Promise<RoutingStatus> {
  const body = await apiRequest<{ status?: unknown }>('/api/routing/status', init)
  // A status this build does not know is not a reason to warn anyone: only the
  // two the banner has words for change the page.
  return ROUTING_STATUSES.find((known) => known === body?.status) ?? 'ok'
}
