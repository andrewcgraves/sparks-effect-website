import { ApiError, apiRequest } from './authoring/client'
import { secondsPhrase } from './authoringFault'
import type { TravelMode } from './authoring/types'
import { JobFailedError, JobTimedOutError, pollUntilSucceeded, type JobStatus } from './polling'
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

export type IsochroneProgress = Pick<RoutingJob, 'status' | 'queue_position'> & {
  // How long this visitor has been waiting, enqueue included, so the wait
  // message can say the site is busy before the job gives up.
  waitedMs?: number
}

export type IsochroneProgressListener = (progress: IsochroneProgress) => void

const POLL_INTERVAL_MS = 1000

export const ISOCHRONE_DEADLINE_MS = 120_000

// The API fails any job still unfinished this long after it was created
// (RoutingJobStaleAfter in sparks-effect-api). A job that fails, or runs out
// the page's own deadline, after waiting this long was not refused for its
// starting point: the queue was too long to reach it.
export const ROUTING_JOB_STALE_AFTER_MS = 90_000

// A job still queued after this long is waiting on a busy queue, and the
// visitor hears so while there is still time for it to finish.
export const BUSY_HINT_AFTER_MS = 30_000

export const BACKLOG_FULL_CODE = 'backlog_full'

export class RoutingBusyError extends Error {
  constructor(cause: Error) {
    super(`Routing is busy: ${cause.message}`)
    this.name = 'RoutingBusyError'
  }
}

// Busy either way: the API refused the enqueue because its backlog is full
// (SPA-219), or the job sat in the queue until it was given up on. Returns how
// long to tell the visitor to wait — the API's Retry-After when the refusal
// carries one (SPA-467) — or null when the error is not routing being busy.
export function routingBusyWait(err: unknown): string | null {
  if (err instanceof RoutingBusyError) return 'a few minutes'
  if (!(err instanceof ApiError) || err.code !== BACKLOG_FULL_CODE) return null
  return err.retryAfterS === undefined ? 'a few minutes' : secondsPhrase(err.retryAfterS)
}

export function fetchRoutingJob(id: string, init?: RequestInit): Promise<RoutingJob> {
  return apiRequest<RoutingJob>(`/api/routing-jobs/${id}`, init)
}

export async function enqueueIsochrone(
  path: string,
  request: IsochroneParams,
  onProgress?: IsochroneProgressListener,
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
  onProgress?: IsochroneProgressListener,
): Promise<ChainResponse> {
  try {
    const succeeded = await pollUntilSucceeded(
      jobId,
      (id) => fetchRoutingJob(id, { headers: traceHeaders(traceId) }),
      {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs: ISOCHRONE_DEADLINE_MS - (Date.now() - startedAt),
        onStatus: (job) =>
          onProgress?.({
            status: job.status,
            queue_position: job.queue_position,
            waitedMs: Date.now() - startedAt,
          }),
      },
    )
    return succeeded.result
  } catch (err) {
    const gaveUp = err instanceof JobFailedError || err instanceof JobTimedOutError
    if (gaveUp && Date.now() - startedAt >= ROUTING_JOB_STALE_AFTER_MS) {
      throw new RoutingBusyError(err)
    }
    throw err
  }
}
