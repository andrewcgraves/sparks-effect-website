import { ApiError, apiRequest } from './client'

export type HandoverStatus = 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'

interface HandoverBase {
  id: string
  service_slug: string
  service_name: string
  status: HandoverStatus
  created_at: string
  expires_at: string
  decided_at?: string
}

export interface IncomingHandover extends HandoverBase {
  from_name: string
}

export interface OutgoingHandover extends HandoverBase {
  to_name: string
}

export interface MyHandovers {
  incoming: IncomingHandover[]
  outgoing: OutgoingHandover[]
}

export const SERVICE_IN_SCENARIOS_CODE = 'service_in_scenarios'

// The API answers 202 with the same body whether or not the address is an
// account, so there is nothing in the answer worth returning.
export async function offerHandover(serviceSlug: string, toEmail: string): Promise<void> {
  await apiRequest<unknown>(`/api/services/${serviceSlug}/handovers`, {
    method: 'POST',
    body: JSON.stringify({ to_email: toEmail }),
  })
}

export async function fetchMyHandovers(): Promise<MyHandovers> {
  return apiRequest<MyHandovers>('/api/me/handovers')
}

export async function cancelHandover(id: string): Promise<OutgoingHandover> {
  return apiRequest<OutgoingHandover>(`/api/handovers/${id}/cancel`, { method: 'POST' })
}

export async function declineHandover(id: string): Promise<IncomingHandover> {
  return apiRequest<IncomingHandover>(`/api/handovers/${id}/decline`, { method: 'POST' })
}

export async function acceptHandover(id: string): Promise<IncomingHandover> {
  return apiRequest<IncomingHandover>(`/api/handovers/${id}/accept`, { method: 'POST' })
}

// The slugs of the sender's scenarios that still hold the service, or null when
// the failure is anything but that refusal. A refusal whose detail this build
// cannot read is still that refusal, just without names.
export function handoverBlockingScenarios(err: unknown): string[] | null {
  if (!(err instanceof ApiError) || err.code !== SERVICE_IN_SCENARIOS_CODE) return null
  const scenarios = (err.detail as { scenarios?: unknown } | null)?.scenarios
  if (!Array.isArray(scenarios)) return []
  return scenarios.filter((slug): slug is string => typeof slug === 'string')
}
