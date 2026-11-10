import { ref, shallowRef } from 'vue'
import { fetchScenario } from '../api/scenarios'
import type { Route, Station, Service } from '../api/scenarios'

export function useScenario(slug: string) {
  const name = ref('')
  const subtext = ref('')
  const description = ref('')
  // Shallow because a network's routes carry tens of thousands of coordinate
  // pairs, and deep reactivity would put a proxy between every one of them and
  // the ridden-line maths that walks them on each plot (SPA-487). Only ever
  // replaced whole, so nothing is lost.
  const routes = shallowRef<Route[]>([])
  const stations = shallowRef<Station[]>([])
  const services = ref<Service[]>([])
  const loading = ref(true)

  fetchScenario(slug).then((detail) => {
    name.value = detail.name
    subtext.value = detail.subtext ?? ''
    description.value = detail.description
    routes.value = detail.routes
    stations.value = detail.stations
    services.value = detail.services
  }).catch(() => {}).finally(() => { loading.value = false })

  return { name, subtext, description, routes, stations, services, loading }
}
