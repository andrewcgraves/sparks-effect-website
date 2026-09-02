// The routing job surface: one isochrone the API has handed to the routing
// worker, and the poll that waits for it.
//
// Since SPA-182 the API computes no isochrones itself — Valhalla is reachable
// only from inside the home cluster, so the API resolves a request down to one
// immutable compiled graph, publishes it to the worker, and answers 202 with
// the job below. All three isochrone endpoints answer this way and all three
// poll the same GET /api/routing-jobs/{id}.
import { ApiError, apiRequest } from './authoring/client'
import type { TravelMode } from './authoring/types'
import { pollUntilSucceeded, type JobStatus } from './polling'
import { newTraceId, traceHeaders } from './traceId'
import type { ChainResponse } from '../fixtures/isochrone'

// The point, budget, and mode every isochrone endpoint takes. The seeded one
// carries a scenario_slug alongside these; the authored ones name their target
// in the URL instead, which is the only difference between the three bodies —
// so one enqueue serves all three.
export interface IsochroneParams {
  lat: number
  lng: number
  budget_mins: number
  mode: TravelMode
}

// One enqueued isochrone: the request resolved down to a point, a budget, a
// mode, and the compiled graph it is to be plotted over. It echoes back the
// params it was asked for, which is why it is those params plus its own state.
//
// owner_id is absent for the public seeded isochrone, which no one
// authenticates to request. An ownerless job is readable by anyone holding its
// id, which is safe only because that id is an unguessable UUID.
export interface RoutingJob extends IsochroneParams {
  id: string
  status: JobStatus
  // The compile job whose result is the graph this isochrone is plotted over.
  // A compiled graph's identity is the job that produced it (SPA-181).
  compile_job_id: string
  owner_id?: string | null
  result?: ChainResponse | null
  error?: string | null
  created_at?: string
  updated_at?: string
}

// How often a queued isochrone is checked on. Matches the compile poll: fast
// enough that a result does not sit unseen, slow enough to be unremarkable.
const POLL_INTERVAL_MS = 1000

// The deadline for one isochrone, measured end to end: it starts before the
// request is even sent, not once there is a job to poll.
//
// Generous because the wait is two waits: the worker plots one chain at a
// time, so a request can sit behind another user's before any of its own work
// starts. Bounded because nothing else bounds it — without this a job the
// worker never picks up leaves the form spinning forever, which reads as a
// hung page rather than a failure the user can retry.
export const ISOCHRONE_DEADLINE_MS = 120_000

// The code on a 429 from any of the three enqueue endpoints: too much routing
// work is already queued or running, so this request was refused rather than
// added to the backlog (SPA-219).
export const BACKLOG_FULL_CODE = 'backlog_full'

// What a person is told when the backlog is full. Owned here rather than taken
// from the server's own prose, the same way an out-of-range origin's message is
// composed client-side from its code: the API's wording is the fallback for
// callers that are not this app.
//
// It says "busy", not "failed", because nothing about the request was wrong and
// the same one will work shortly — which is the only thing that separates this
// from every other refusal as far as the person in front of the form is
// concerned.
const BACKLOG_FULL_MESSAGE =
  'The isochrone service is busy right now. Please try again in a few moments.'

// Reads a full backlog out of a rejected enqueue, or null when that is not what
// went wrong — so a caller can chain it into its error handling the way it
// already chains outOfRangeError.
//
// It matches on the code rather than the 429 alone: a bare status could come
// from an edge rate limiter or a proxy in front of the API, which is a
// different situation and not one this message describes.
export function backlogFullError(err: unknown): string | null {
  if (!(err instanceof ApiError) || err.code !== BACKLOG_FULL_CODE) return null
  return BACKLOG_FULL_MESSAGE
}

// Reads a routing job's current state. `init` is how an enqueue reuses its
// trace id on every poll (SPA-205); one-shot callers omit it and get a
// fresh id from apiRequest.
export function fetchRoutingJob(id: string, init?: RequestInit): Promise<RoutingJob> {
  return apiRequest<RoutingJob>(`/api/routing-jobs/${id}`, init)
}

// Requests an isochrone and resolves with the chain once the worker has
// plotted it, rejecting if the job fails or the deadline passes.
//
// This is what turns a 202 back into the promise-of-a-result the callers above
// still expect, so nothing outside this layer has to know an isochrone is now
// queued work rather than a request that answers in line. All three endpoints
// go through here; they differ only in the path.
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

// Waits out an already-enqueued routing job, spending what is left of the
// deadline that started at `startedAt` — so a slow enqueue eats into the wait
// rather than being granted a fresh one on top of it.
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
