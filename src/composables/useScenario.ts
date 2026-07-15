import { ref } from 'vue'
import { fetchScenario } from '../api/scenarios'
import type { Route, Station, Service } from '../api/scenarios'

export function useScenario(slug: string) {
  const name = ref<string>('')
  const description = ref<string>('')
  const routes = ref<Route[]>([])
  const stations = ref<Station[]>([])
  const services = ref<Service[]>([])
  const error = ref<string | null>(null)

  fetchScenario(slug).then((detail) => {
    name.value = detail.name
    description.value = detail.description
    routes.value = detail.routes
    stations.value = detail.stations
    services.value = detail.services
  }).catch(() => {
    error.value = `We couldn't load the "${slug}" service. It may not exist or the API is unavailable.`
  })

  return { name, description, routes, stations, services, error }
}
