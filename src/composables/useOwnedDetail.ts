import { ref, type Ref } from 'vue'
import { ApiError } from '../api/authoring/client'

export function useOwnedDetail<T>(fetcher: (slug: string) => Promise<T>, slug: string) {
  const item = ref<T | null>(null) as Ref<T | null>
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
