import { apiRequest } from './client'
import { enqueueIsochrone } from '../routingJobs'
import type { ChainResponse } from '../../fixtures/isochrone'
import type { AuthoredIsochroneRequest, Job, Service, ServiceInput, TransitGraph } from './types'

export async function listServices(): Promise<Service[]> {
  return apiRequest<Service[]>('/api/services')
}

export async function fetchMyServices(): Promise<Service[]> {
  return listServices()
}

export async function fetchService(slug: string): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`)
}

export async function createService(input: ServiceInput): Promise<Service> {
  return apiRequest<Service>('/api/services', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function updateService(slug: string, input: ServiceInput): Promise<Service> {
  return apiRequest<Service>(`/api/services/${slug}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export async function deleteService(slug: string): Promise<void> {
  await apiRequest<void>(`/api/services/${slug}`, { method: 'DELETE' })
}

export async function compileService(slug: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/services/${slug}/compile`, { ...init, method: 'POST' })
}

export async function fetchServiceGraph(slug: string): Promise<TransitGraph> {
  return apiRequest<TransitGraph>(`/api/services/${slug}/graph`)
}

export function fetchServiceIsochrone(
  slug: string,
  request: AuthoredIsochroneRequest,
): Promise<ChainResponse> {
  return enqueueIsochrone(`/api/services/${slug}/isochrone`, request)
}
