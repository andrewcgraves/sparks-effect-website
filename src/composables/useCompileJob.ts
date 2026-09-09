import { ref } from 'vue'
import { useJobsStore } from '../stores/jobs'
import { latestAttempt } from './latestAttempt'
import { newTraceId, traceHeaders } from '../api/traceId'
import type { Job, TransitGraph } from '../api/authoring'

export function useCompileJob(compile: (slug: string, init?: RequestInit) => Promise<Job>) {
  const jobs = useJobsStore()
  const compiling = ref(false)
  const compileError = ref('')
  const result = ref<TransitGraph | null>(null)

  // A compile superseded mid-flight must not resurrect itself when it lands —
  // or, worse, report its failure over the newer attempt's result.
  const attempts = latestAttempt()

  async function trigger(slug: string): Promise<void> {
    const attempt = attempts.begin()
    compiling.value = true
    compileError.value = ''
    try {
      // One id for the compile POST and every poll of that job (SPA-205).
      const traceId = newTraceId()
      const job = await compile(slug, { headers: traceHeaders(traceId) })
      const finished = await jobs.track(job.id, { traceId })
      if (!attempts.isCurrent(attempt)) return
      result.value = finished.result ?? null
    } catch (err) {
      if (!attempts.isCurrent(attempt)) return
      compileError.value = err instanceof Error ? err.message : 'Compile failed.'
    } finally {
      // Left alone when superseded: the attempt that replaced this one set it,
      // and owns clearing it.
      if (attempts.isCurrent(attempt)) compiling.value = false
    }
  }

  function reset(): void {
    attempts.supersede()
    compiling.value = false
    compileError.value = ''
    result.value = null
  }

  return { compiling, compileError, result, trigger, reset }
}
