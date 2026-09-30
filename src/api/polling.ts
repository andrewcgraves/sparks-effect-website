export type JobStatus = 'queued' | 'running' | 'succeeded' | 'failed'

export interface PollableJob {
  id: string
  status: JobStatus
  result?: unknown
  error?: string | null
}

export interface PollOptions<T> {
  intervalMs?: number
  timeoutMs?: number
  signal?: AbortSignal
  onStatus?: (job: T) => void
}

export class JobFailedError extends Error {
  readonly jobError: string | null

  constructor(jobId: string, jobError: string | null | undefined) {
    super(`Job ${jobId} failed: ${jobError ?? 'unknown error'}`)
    this.name = 'JobFailedError'
    this.jobError = jobError ?? null
  }
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error('Polling aborted'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new Error('Polling aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export async function pollUntilSucceeded<T extends PollableJob>(
  jobId: string,
  fetchOne: (id: string) => Promise<T>,
  options?: PollOptions<T>,
): Promise<T & { result: NonNullable<T['result']> }> {
  const intervalMs = options?.intervalMs ?? 1000
  const timeoutMs = options?.timeoutMs ?? 60000
  const signal = options?.signal
  const deadline = Date.now() + timeoutMs

  if (signal?.aborted) throw new Error('Polling aborted')

  for (;;) {
    const job = await fetchOne(jobId)
    options?.onStatus?.(job)

    if (job.status === 'succeeded') {
      if (job.result == null) {
        throw new Error(`Job ${jobId} succeeded but has no result`)
      }
      return job as T & { result: NonNullable<T['result']> }
    }

    if (job.status === 'failed') {
      throw new JobFailedError(jobId, job.error)
    }

    if (Date.now() >= deadline) {
      throw new Error(`Job ${jobId} timed out after ${timeoutMs}ms`)
    }

    await delay(intervalMs, signal)
  }
}
