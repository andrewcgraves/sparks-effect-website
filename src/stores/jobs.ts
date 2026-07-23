// Tracks async authoring jobs so their progress survives view navigation.
import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { pollJobToResult, type Job, type JobStatus, type PollJobOptions, type TransitGraph } from '../api/authoring'

// A job the store is watching. 'cancelled' is store-local: the API never reports it.
export interface TrackedJob {
  id: string
  status: JobStatus | 'cancelled'
  result: TransitGraph | null
  error: string | null
}

// Statuses that mean the job is still in flight.
const PENDING: ReadonlySet<TrackedJob['status']> = new Set(['queued', 'running'])

function initialEntry(id: string): TrackedJob {
  return { id, status: 'queued', result: null, error: null }
}

export const useJobsStore = defineStore('jobs', () => {
  const entries = ref<Record<string, TrackedJob>>({})
  // Abort handles live outside reactive state — they're control plumbing, not UI data.
  const controllers = new Map<string, AbortController>()

  const jobById = computed(() => (jobId: string): TrackedJob | undefined => entries.value[jobId])
  const isPending = computed(() => (jobId: string): boolean => {
    const entry = entries.value[jobId]
    return entry ? PENDING.has(entry.status) : false
  })
  const anyPending = computed(() =>
    Object.values(entries.value).some((entry) => PENDING.has(entry.status)),
  )

  function abort(jobId: string): void {
    controllers.get(jobId)?.abort()
    controllers.delete(jobId)
  }

  // Watches a job to completion, mirroring its progress into the store.
  // Resolves with the succeeded job (its `result` is the compiled graph), or
  // rejects if the job fails, times out, or is cancelled.
  function track(
    jobId: string,
    options?: Omit<PollJobOptions, 'signal' | 'onStatus'>,
  ): Promise<Job> {
    // A second watch of the same id supersedes the first.
    abort(jobId)

    const controller = new AbortController()
    controllers.set(jobId, controller)
    entries.value[jobId] = initialEntry(jobId)

    // Only the newest watch of this id may write to the store.
    const isCurrent = () => controllers.get(jobId) === controller

    return pollJobToResult(jobId, {
      ...options,
      signal: controller.signal,
      onStatus: (job: Job) => {
        if (!isCurrent()) return
        entries.value[jobId] = {
          ...entries.value[jobId],
          status: job.status,
          error: job.error ?? null,
        }
      },
    })
      .then((job) => {
        if (isCurrent()) {
          entries.value[jobId] = {
            ...entries.value[jobId],
            status: 'succeeded',
            result: job.result ?? null,
            error: null,
          }
          controllers.delete(jobId)
        }
        return job
      })
      .catch((err: unknown) => {
        // A superseded or cleared watch must not stomp the entry that replaced it.
        if (isCurrent()) {
          entries.value[jobId] = {
            ...entries.value[jobId],
            status: controller.signal.aborted ? 'cancelled' : 'failed',
            result: null,
            error: err instanceof Error ? err.message : String(err),
          }
          controllers.delete(jobId)
        }
        throw err
      })
  }

  // Stops watching a job, leaving its entry visible as 'cancelled'.
  function cancel(jobId: string): void {
    const entry = entries.value[jobId]
    if (!entry) return
    abort(jobId)
    entries.value[jobId] = { ...entry, status: 'cancelled' }
  }

  // Stops watching a job and forgets it entirely.
  function clear(jobId: string): void {
    abort(jobId)
    delete entries.value[jobId]
  }

  function reset(): void {
    for (const jobId of Object.keys(entries.value)) abort(jobId)
    entries.value = {}
  }

  return { entries, jobById, isPending, anyPending, track, cancel, clear, reset }
})
