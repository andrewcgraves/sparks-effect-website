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
  queue_position?: number
  created_at?: string
  updated_at?: string
}

export type IsochroneProgress = Pick<RoutingJob, 'status' | 'queue_position'>

const POLL_INTERVAL_MS = 1000

export const ISOCHRONE_DEADLINE_MS = 120_000

export const BACKLOG_FULL_CODE = 'backlog_full'

export function backlogFullError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== BACKLOG_FULL_CODE) return null
  const seconds = err.retryAfterS
  const wait = seconds === undefined ? 'a few moments' : seconds === 1 ? '1 second' : `${seconds} seconds`
  return `The isochrone service is busy right now. Please try again in ${wait}.`
}

export function isochroneWaitMessage(progress: IsochroneProgress | null): string {
  if (progress === null) return 'Waiting…'
  if (progress.status !== 'queued') return 'Plotting…'
  const ahead = progress.queue_position
  if (ahead === undefined) return 'Waiting…'
  if (ahead === 0) return "You're next…"
  return `Waiting — ${ahead} ahead of you`
}

export function fetchRoutingJob(id: string, init?: RequestInit): Promise<RoutingJob> {
  return apiRequest<RoutingJob>(`/api/routing-jobs/${id}`, init)
}

export async function enqueueIsochrone(
  path: string,
  request: IsochroneParams,
  onProgress?: (progress: IsochroneProgress) => void,
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
  return awaitIsochrone(job.id, startedAt, traceId, onProgress)
}

async function awaitIsochrone(
  jobId: string,
  startedAt: number,
  traceId: string,
  onProgress?: (progress: IsochroneProgress) => void,
): Promise<ChainResponse> {
  const succeeded = await pollUntilSucceeded(
    jobId,
    (id) => fetchRoutingJob(id, { headers: traceHeaders(traceId) }),
    {
      intervalMs: POLL_INTERVAL_MS,
      timeoutMs: ISOCHRONE_DEADLINE_MS - (Date.now() - startedAt),
      onStatus: (job) => onProgress?.({ status: job.status, queue_position: job.queue_position }),
    },
  )
  return succeeded.result
}
