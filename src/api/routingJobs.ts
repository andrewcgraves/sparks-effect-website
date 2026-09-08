import { ApiError, apiRequest } from './authoring/client'
import type { TravelMode } from './authoring/types'
import { pollUntilSucceeded, type JobStatus } from './polling'
import { newTraceId, traceHeaders } from './traceId'
import type { ChainResponse } from '../fixtures/isochrone'

export interface IsochroneParams {
  lat: number
  lng: number
  budget_mins: number
  mode: TravelMode
}

export interface RoutingJob extends IsochroneParams {
  id: string
  status: JobStatus
  compile_job_id: string
  owner_id?: string | null
  result?: ChainResponse | null
  error?: string | null
  created_at?: string
  updated_at?: string
}

const POLL_INTERVAL_MS = 1000

export const ISOCHRONE_DEADLINE_MS = 120_000

export const BACKLOG_FULL_CODE = 'backlog_full'

const BACKLOG_FULL_MESSAGE =
  'The isochrone service is busy right now. Please try again in a few moments.'

export function backlogFullError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== BACKLOG_FULL_CODE) return null
  return BACKLOG_FULL_MESSAGE
}

export function fetchRoutingJob(id: string, init?: RequestInit): Promise<RoutingJob> {
  return apiRequest<RoutingJob>(`/api/routing-jobs/${id}`, init)
}

export async function enqueueIsochrone(
  path: string,
  request: IsochroneParams,
): Promise<ChainResponse> {
  const startedAt = Date.now()
  // One id for the enqueue and every poll of this job — grepping logs for it
  // reconstructs the whole wait, not just the POST (SPA-205).
  const traceId = newTraceId()
  const job = await apiRequest<RoutingJob>(path, {
    method: 'POST',
    body: JSON.stringify(request),
    headers: traceHeaders(traceId),
  })
  return awaitIsochrone(job.id, startedAt, traceId)
}

async function awaitIsochrone(
  jobId: string,
  startedAt: number,
  traceId: string,
): Promise<ChainResponse> {
  const succeeded = await pollUntilSucceeded(
    jobId,
    (id) => fetchRoutingJob(id, { headers: traceHeaders(traceId) }),
    {
      intervalMs: POLL_INTERVAL_MS,
      timeoutMs: ISOCHRONE_DEADLINE_MS - (Date.now() - startedAt),
    },
  )
  return succeeded.result
}
