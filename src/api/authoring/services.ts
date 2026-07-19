// Service CRUD operations.
import { apiRequest } from './client'
import type { Service, ServiceInput } from './types'

// Lists all services.
export async function listServices(): Promise<Service[]> {
  return apiRequest<Service[]>('/api/services')
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
