import { ref, type Ref } from 'vue'

// Fetches a list on creation and mirrors its lifecycle as reactive refs.
// The error is a flag rather than a message: callers own their own copy.
export function useOwnedList<T>(fetcher: () => Promise<T[]>) {
  const items: Ref<T[]> = ref([])
  const loading = ref(true)
  const error = ref(false)

  fetcher()
    .then((result) => { items.value = result })
    .catch(() => { error.value = true })
    .finally(() => { loading.value = false })

  return { items, loading, error }
}
