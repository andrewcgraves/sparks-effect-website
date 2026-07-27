import { ref } from 'vue'
import { useJobsStore } from '../stores/jobs'
import { latestAttempt } from './latestAttempt'
import type { Job, TransitGraph } from '../api/authoring'

/**
 * Fires a compile endpoint and tracks the resulting job to completion.
 *
 * This is the compile -> poll adapter beneath useAuthoredGraph, and it is also
 * the whole of what the service authoring form needs: that form compiles a
 * service it has just created, so there is no existing graph of its own that
 * could have gone stale underneath it.
 *
 * Stale-graph recovery deliberately does not live here. Only the isochrone
 * endpoint answers 409 stale_graph, so useAuthoredGraph owns that retry and its
 * bound (SPA-148). This used to retry it too, on a branch nothing could reach.
 */
export function useCompileJob(compile: (slug: string) => Promise<Job>) {
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
      const job = await compile(slug)
      const finished = await jobs.track(job.id)
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
