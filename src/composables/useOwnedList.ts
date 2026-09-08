import { ref, type Ref } from 'vue'

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
