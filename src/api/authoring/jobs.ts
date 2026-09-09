import { apiRequest } from './client'
import { pollUntilSucceeded, type PollOptions } from '../polling'
import { traceHeaders } from '../traceId'
import type { Job } from './types'

export async function fetchJob(jobId: string, init?: RequestInit): Promise<Job> {
  return apiRequest<Job>(`/api/jobs/${jobId}`, init)
}

export type PollJobOptions = PollOptions<Job> & {
  traceId?: string
}

export function pollJobToResult(jobId: string, options?: PollJobOptions): Promise<Job> {
  const traceId = options?.traceId
  const fetchOne =
    traceId != null ? (id: string) => fetchJob(id, { headers: traceHeaders(traceId) }) : fetchJob
  return pollUntilSucceeded(jobId, fetchOne, options)
}
