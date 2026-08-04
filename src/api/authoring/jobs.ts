// Compile job status polling and result resolution.
import { apiRequest } from './client'
import { pollUntilSucceeded, type PollOptions } from '../polling'
import type { Job } from './types'

// Fetches the current state of an async job.
export async function fetchJob(jobId: string): Promise<Job> {
  return apiRequest<Job>(`/api/jobs/${jobId}`)
}

// Options controlling pollJobToResult's cadence, timeout, and cancellation.
export type PollJobOptions = PollOptions<Job>

// Polls a job until it succeeds or fails/times out, resolving with the
// succeeded job itself — its `result` is the compiled TransitGraph. There is
// no separate fetch-by-slug: the compile endpoints embed the result directly
// on the job, so a caller already reading the graph reads it off this return
// value.
export function pollJobToResult(jobId: string, options?: PollJobOptions): Promise<Job> {
  return pollUntilSucceeded(jobId, fetchJob, options)
}
