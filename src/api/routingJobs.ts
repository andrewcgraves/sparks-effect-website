// The routing job surface: one isochrone the API has handed to the routing
// worker, and the poll that waits for it.
//
// Since SPA-182 the API computes no isochrones itself — Valhalla is reachable
// only from inside the home cluster, so the API resolves a request down to one
// immutable compiled graph, publishes it to the worker, and answers 202 with
// the job below. All three isochrone endpoints answer this way and all three
// poll the same GET /api/routing-jobs/{id}.
import { apiRequest } from './authoring/client'
import { pollUntilSucceeded, type JobStatus } from './polling'
import type { ChainResponse } from '../fixtures/isochrone'

// One enqueued isochrone: the request resolved down to a point, a budget, a
// mode, and the compiled graph it is to be plotted over.
//
// owner_id is absent for the public seeded isochrone, which no one
// authenticates to request. An ownerless job is readable by anyone holding its
// id, which is safe only because that id is an unguessable UUID.
export interface RoutingJob {
  id: string
  status: JobStatus
  // The compile job whose result is the graph this isochrone is plotted over.
  // A compiled graph's identity is the job that produced it (SPA-181).
  compile_job_id: string
  owner_id?: string | null
  lat: number
  lng: number
  budget_mins: number
  mode: 'walk' | 'bike' | 'drive'
  result?: ChainResponse | null
  error?: string | null
  created_at?: string
  updated_at?: string
}

// How often a queued isochrone is checked on. Matches the compile poll: fast
// enough that a result does not sit unseen, slow enough to be unremarkable.
export const ISOCHRONE_POLL_INTERVAL_MS = 1000

// The end-to-end deadline for one isochrone, from enqueue to result.
//
// Generous because the wait is now two waits: the worker plots one chain at a
// time, so a request can sit behind another user's before any of its own work
// starts. Bounded because nothing else bounds it — without this a job the
// worker never picks up leaves the form spinning forever, which reads as a
// hung page rather than a failure the user can retry.
export const ISOCHRONE_DEADLINE_MS = 120_000

// Reads a routing job's current state.
export function fetchRoutingJob(id: string): Promise<RoutingJob> {
  return apiRequest<RoutingJob>(`/api/routing-jobs/${id}`)
}

// Waits for an enqueued isochrone and resolves with the chain the worker
// computed, rejecting if the job fails or the deadline passes.
//
// This is what turns a 202 back into the promise-of-a-result the callers above
// still expect, so nothing outside this layer has to know an isochrone is now
// queued work rather than a request that answers in line.
export async function awaitIsochrone(job: RoutingJob): Promise<ChainResponse> {
  const succeeded = await pollUntilSucceeded(job.id, fetchRoutingJob, {
    intervalMs: ISOCHRONE_POLL_INTERVAL_MS,
    timeoutMs: ISOCHRONE_DEADLINE_MS,
  })
  return succeeded.result
}
