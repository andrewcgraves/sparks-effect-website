import { ref, type Ref } from 'vue'
import { ApiError, isSessionExpiry } from '../api/authoring/client'

// An expired session reports nothing: the user is already being sent to sign
// in, so the page stays loading rather than flashing a failure first.
export function useOwnedDetail<T>(fetcher: (slug: string) => Promise<T>, slug: string) {
  const item = ref<T | null>(null) as Ref<T | null>
  const loading = ref(true)
  const notFound = ref(false)
  const error = ref(false)

  fetcher(slug)
    .then((result) => {
      item.value = result
      loading.value = false
    })
    .catch((err: unknown) => {
      if (isSessionExpiry(err)) return
      if (err instanceof ApiError && err.status === 404) {
        notFound.value = true
      } else {
        error.value = true
      }
      loading.value = false
    })

  return { item, loading, notFound, error }
}
