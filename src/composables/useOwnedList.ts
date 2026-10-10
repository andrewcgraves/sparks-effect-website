import { ref, type Ref } from 'vue'
import { isSessionExpiry } from '../api/authoring/client'

// An expired session reports nothing: the user is already being sent to sign
// in, so the list stays loading rather than flashing a failure first.
export function useOwnedList<T>(fetcher: () => Promise<T[]>) {
  const items: Ref<T[]> = ref([])
  const loading = ref(true)
  const error = ref(false)

  // A reload leaves `loading` alone, so the list on screen stays put until its
  // replacement arrives instead of collapsing into a skeleton and back.
  async function reload(): Promise<void> {
    try {
      items.value = await fetcher()
      error.value = false
      loading.value = false
    } catch (err) {
      if (isSessionExpiry(err)) return
      error.value = true
      loading.value = false
    }
  }

  void reload()

  return { items, loading, error, reload }
}
