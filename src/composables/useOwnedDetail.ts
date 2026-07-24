import { ref, type Ref } from 'vue'
import { ApiError } from '../api/authoring/client'

// Fetches one record by slug and mirrors its lifecycle as reactive refs.
// notFound is split out from error because a missing slug is a routine
// outcome of a stale link, not a failure the user should retry.
export function useOwnedDetail<T>(fetcher: (slug: string) => Promise<T>, slug: string) {
  const item: Ref<T | null> = ref(null) as Ref<T | null>
  const loading = ref(true)
  const notFound = ref(false)
  const error = ref(false)

  fetcher(slug)
    .then((result) => { item.value = result })
    .catch((err) => {
      if (err instanceof ApiError && err.status === 404) {
        notFound.value = true
      } else {
        error.value = true
      }
    })
    .finally(() => { loading.value = false })

  return { item, loading, notFound, error }
}
