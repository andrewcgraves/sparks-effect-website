import { ref } from 'vue'
import { fetchScenarioTravelTimes } from '../api/scenarios'
import type { SegmentTime } from '../api/scenarios'

// A seeded scenario's adjacent-segment run times. These are supporting detail
// rather than the reason the page exists, so a failure is logged and reported
// as `failed` for the caller to hide the section over — never as a banner that
// would sit between the reader and a working map.
export function useScenarioTravelTimes(slug: string) {
  const segments = ref<SegmentTime[]>([])
  const loading = ref(true)
  const failed = ref(false)

  fetchScenarioTravelTimes(slug)
    .then((travelTimes) => { segments.value = travelTimes.segments })
    .catch((err) => {
      failed.value = true
      console.error(`Failed to load travel times for ${slug}`, err)
    })
    .finally(() => { loading.value = false })

  return { segments, loading, failed }
}
