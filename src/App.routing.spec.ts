import { describe, expect, it, vi, beforeEach } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createRouter, createMemoryHistory } from 'vue-router'
import { ref } from 'vue'
import App from './App.vue'
import ServiceView from './views/ServiceView.vue'

vi.mock('./analytics/index', () => ({
  trackPageView: vi.fn(),
}))

vi.mock('./api/isochrone', () => ({
  fetchIsochrone: vi.fn(),
}))

vi.mock('./composables/useScenario', () => ({
  useScenario: () => ({
    name: ref(''),
    description: ref(''),
    routes: ref([]),
    stations: ref([]),
    services: ref([]),
  }),
}))

import { trackPageView } from './analytics/index'

function makeRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', redirect: '/service/ca-hsr' },
      { path: '/service/:slug', name: 'service', component: ServiceView, props: true },
    ],
  })
}

describe('App routing', () => {
  beforeEach(() => {
    vi.mocked(trackPageView).mockClear()
  })

  it('remounts the service view and re-tracks a page view when the slug changes', async () => {
    const router = makeRouter()
    router.push('/service/ca-hsr')
    await router.isReady()

    mount(App, {
      global: {
        plugins: [router],
        stubs: { MapView: true, IsochroneForm: true, SpeedGraph: true },
      },
    })
    await flushPromises()

    expect(trackPageView).toHaveBeenCalledTimes(1)
    expect(trackPageView).toHaveBeenLastCalledWith('/service/ca-hsr')

    await router.push('/service/brightline-west')
    await flushPromises()

    expect(trackPageView).toHaveBeenCalledTimes(2)
    expect(trackPageView).toHaveBeenLastCalledWith('/service/brightline-west')
  })
})
