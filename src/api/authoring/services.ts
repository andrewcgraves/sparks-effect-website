// Service CRUD operations.
import { apiRequest } from './client'
import type { Job, Service, ServiceInput } from './types'

// Lists the signed-in user's own user-authored services. There is no "all
// services" read: /api/services is owner-scoped, same as the rest of this
// CRUD surface.
export async function listServices(): Promise<Service[]> {
  return apiRequest<Service[]>('/api/services')
}

// Alias of listServices — kept as its own name because callers reach for
// "mine" alongside fetchMyScenarios.
export async function fetchMyServices(): Promise<Service[]> {
  return listServices()
}

// Fetches a single service by slug.
export async function fetchService(slug: string): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`)
}

// Creates a new service.
export async function createService(input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('/api/services', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

// Updates an existing service by slug.
export async function updateService(slug: string, input: ServiceInput): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

// Deletes a service by slug.
export async function deleteService(slug: string): Promise<void> {
  await apiRequest<void>(`/api/services/${slug}`, { method: 'DELETE' })
}

// Triggers a compile of a single service, degenerate as a one-member
// scenario. Returns the queued job immediately; poll it via fetchJob /
// pollJobToResult to reach the compiled TransitGraph.
export async function compileService(slug: string): Promise<Job> {
  return apiRequest<Job>(`/api/services/${slug}/compile`, { method: 'POST' })
}
