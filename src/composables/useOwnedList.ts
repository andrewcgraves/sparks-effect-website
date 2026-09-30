import { ref, type Ref } from 'vue'
import { isSessionExpiry } from '../api/authoring/client'

// An expired session reports nothing: the user is already being sent to sign
// in, so the list stays loading rather than flashing a failure first.
export function useOwnedList<T>(fetcher: () => Promise<T[]>) {
  const items: Ref<T[]> = ref([])
  const loading = ref(true)
  const error = ref(false)

  fetcher()
    .then((result) => {
      items.value = result
      loading.value = false
    })
    .catch((err: unknown) => {
      if (isSessionExpiry(err)) return
      error.value = true
      loading.value = false
    })

  return { items, loading, error }
}
