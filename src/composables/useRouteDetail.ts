import { ref } from 'vue'
import { fetchRoute } from '../api/authoring'
import type { Route } from '../api/authoring'
import { ApiError } from '../api/authoring/client'

export function useRouteDetail(slug: string) {
  const route = ref<Route | null>(null)
  const loading = ref(true)
  const notFound = ref(false)
  const error = ref(false)

  fetchRoute(slug)
    .then((result) => {
      route.value = result
    })
    .catch((err) => {
      if (err instanceof ApiError && err.status === 404) {
        notFound.value = true
      } else {
        error.value = true
      }
    })
    .finally(() => {
      loading.value = false
    })

  return { route, loading, notFound, error }
}
