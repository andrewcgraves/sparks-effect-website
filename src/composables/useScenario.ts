import { ref } from 'vue'
import { fetchScenario } from '../api/scenarios'
import type { Route, Station, Service } from '../api/scenarios'

export function useScenario(slug: string) {
  const name = ref('')
  const description = ref('')
  const routes = ref<Route[]>([])
  const stations = ref<Station[]>([])
  const services = ref<Service[]>([])
  const loading = ref(true)

  fetchScenario(slug).then((detail) => {
    name.value = detail.name
    description.value = detail.description
    routes.value = detail.routes
    stations.value = detail.stations
    services.value = detail.services
  }).catch(() => {}).finally(() => { loading.value = false })

  return { name, description, routes, stations, services, loading }
}
