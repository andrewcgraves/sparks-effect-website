import { ref } from 'vue'
import { fetchScenario } from '../api/scenarios'
import type { Route, Station, Service } from '../api/scenarios'

export function useScenario(slug: string) {
  const routes = ref<Route[]>([])
  const stations = ref<Station[]>([])
  const services = ref<Service[]>([])

  fetchScenario(slug).then((detail) => {
    routes.value = detail.routes
    stations.value = detail.stations
    services.value = detail.services
  }).catch(() => {})

  return { routes, stations, services }
}
