import { ref } from 'vue'
import { useJobsStore } from '../stores/jobs'
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

  // Bumped by every trigger and by reset. An attempt that is no longer the
  // current one has been superseded mid-flight, and writing what it eventually
  // returns would resurrect a compile the caller has already moved on from —
  // or, worse, report the older attempt's failure over the newer one's result.
  let generation = 0

  async function trigger(slug: string): Promise<void> {
    const attempt = ++generation
    compiling.value = true
    compileError.value = ''
    try {
      const job = await compile(slug)
      const finished = await jobs.track(job.id)
      if (attempt !== generation) return
      result.value = finished.result ?? null
    } catch (err) {
      if (attempt !== generation) return
      compileError.value = err instanceof Error ? err.message : 'Compile failed.'
    } finally {
      // Left alone when superseded: the attempt that replaced this one set it,
      // and owns clearing it.
      if (attempt === generation) compiling.value = false
    }
  }

  function reset(): void {
    generation++
    compiling.value = false
    compileError.value = ''
    result.value = null
  }

  return { compiling, compileError, result, trigger, reset }
}
