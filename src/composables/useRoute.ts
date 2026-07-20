import { ref } from 'vue'
import { fetchRoute } from '../api/authoring'
import type { Route } from '../api/authoring'

export function useRoute(slug: string) {
  const route = ref<Route | null>(null)
  const loading = ref(true)
  const notFound = ref(false)

  fetchRoute(slug)
    .then((result) => {
      route.value = result
    })
    .catch(() => {
      notFound.value = true
    })
    .finally(() => {
      loading.value = false
    })

  return { route, loading, notFound }
}
