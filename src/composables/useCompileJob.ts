import { ref } from 'vue'
import { useJobsStore } from '../stores/jobs'
import { ApiError } from '../api/authoring/client'
import type { Job, TransitGraph } from '../api/authoring'

// A stale-graph retry should settle in one or two hops in practice; this just
// bounds it so a persistently stale signal can't spin the UI forever.
const MAX_STALE_GRAPH_RETRIES = 3

/**
 * Drives the compile -> poll chain shared by service and scenario authoring:
 * fire the given compile endpoint, track the resulting job to completion, and
 * transparently retry on a stale_graph 409 (SPA-83 decision 4) rather than
 * surfacing it as an error — a compiled graph falling behind an edit is not a
 * failure, it's a reason to recompile.
 */
export function useCompileJob(compile: (slug: string) => Promise<Job>) {
  const jobs = useJobsStore()
  const compiling = ref(false)
  const compileError = ref('')
  const result = ref<TransitGraph | null>(null)

  async function trigger(slug: string, attempt = 1): Promise<void> {
    compiling.value = true
    compileError.value = ''
    try {
      const job = await compile(slug)
      const finished = await jobs.track(job.id)
      result.value = finished.result ?? null
    } catch (err) {
      if (err instanceof ApiError && err.code === 'stale_graph' && attempt < MAX_STALE_GRAPH_RETRIES) {
        await trigger(slug, attempt + 1)
        return
      }
      compileError.value = err instanceof Error ? err.message : 'Compile failed.'
    } finally {
      compiling.value = false
    }
  }

  function reset(): void {
    compiling.value = false
    compileError.value = ''
    result.value = null
  }

  return { compiling, compileError, result, trigger, reset }
}
