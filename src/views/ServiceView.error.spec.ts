import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import ServiceView from './ServiceView.vue'

vi.mock('../analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('../api/isochrone', () => ({
  fetchIsochrone: vi.fn(),
}))

vi.mock('../composables/useScenario', () => ({
  useScenario: () => ({
    name: ref(''),
    description: ref(''),
    routes: ref([]),
    stations: ref([]),
    services: ref([]),
    error: ref('We couldn\'t load the "missing-service" service. It may not exist or the API is unavailable.'),
  }),
}))

vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/service/missing-service' }),
}))

describe('ServiceView scenario load error', () => {
  it('shows a scenario error message when the scenario fails to load', () => {
    const wrapper = mount(ServiceView, {
      props: { slug: 'missing-service' },
      global: { stubs: { MapView: true, IsochroneForm: true, SpeedGraph: true } },
    })
    const error = wrapper.find('[data-testid="scenario-error"]')
    expect(error.exists()).toBe(true)
    expect(error.text()).toContain('missing-service')
  })
})
