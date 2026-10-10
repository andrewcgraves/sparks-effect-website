import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
import type { OwnedRoute, Route } from '../api/authoring/types'

vi.mock('../api/authoring/routes', () => ({
  fetchMyRoute: vi.fn(),
  createRoute: vi.fn(),
  updateRoute: vi.fn(),
  deleteRoute: vi.fn(),
}))

import RouteBuilderView from './RouteBuilderView.vue'
import { seriousA11yViolations } from '../test/axe'
import { breadcrumbTrail } from '../test/breadcrumbs'
import { busyRegion, visibleText } from '../test/loading'
import { mountSharedHosts } from '../test/sharedHosts'
import { createRoute, deleteRoute, fetchMyRoute, updateRoute } from '../api/authoring/routes'
import { ApiError } from '../api/authoring/client'
import { useAuthStore } from '../stores/auth'
import { useConfirmHost } from '../composables/useConfirm'

const sfToSj: [number, number][] = [[-122.4194, 37.7749], [-121.8863, 37.3382]]

const lineText = JSON.stringify({ type: 'LineString', coordinates: sfToSj })

const stubRoute: Route = {
  id: 'rt1',
  slug: 'main-line',
  name: 'Main Line',
  description: 'The spine',
  mode: 'rail',
  bidirectional: true,
  geometry: { type: 'LineString', coordinates: sfToSj },
  segments: [],
}

function owned(overrides: Partial<OwnedRoute> = {}): OwnedRoute {
  return { ...stubRoute, length_m: 62000, dependents: { services: 0, user_services: 0, segments: 0 }, ...overrides }
}

const Stub = { template: '<div>stub</div>' }

function makeRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/authoring', name: 'authoring', component: Stub },
      { path: '/authoring/routes/new', name: 'new-route', component: RouteBuilderView },
      { path: '/authoring/routes/:slug', name: 'edit-route', component: RouteBuilderView, props: true },
      { path: '/authoring/services/new', name: 'new-service', component: Stub },
      { path: '/authoring/services/:slug/edit', name: 'edit-service', component: Stub, props: true },
    ],
  })
}

async function mountAt(path: string, slug?: string, attachTo?: HTMLElement) {
  const router = makeRouter()
  await router.push(path)
  const wrapper = mount(RouteBuilderView, {
    props: slug ? { slug } : {},
    global: { plugins: [router], stubs: { MapView: true } },
    attachTo,
  })
  await flushPromises()
  return { wrapper, router }
}

type Wrapper = Awaited<ReturnType<typeof mountAt>>['wrapper']

async function pasteLine(wrapper: Wrapper, text = lineText) {
  await wrapper.get('[data-testid="route-geojson-text"]').setValue(text)
  await wrapper.get('[data-testid="import-geojson"]').trigger('click')
  await flushPromises()
}

function mapStub(wrapper: Wrapper) {
  return wrapper.findComponent({ name: 'MapView' })
}

describe('RouteBuilderView', () => {
  let hosts: ReturnType<typeof mountSharedHosts>

  beforeEach(() => {
    hosts = mountSharedHosts()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    useAuthStore().signIn('tok-1', { id: 'u1', email: 'a@example.com' })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(createRoute).mockResolvedValue(stubRoute)
    vi.mocked(updateRoute).mockResolvedValue(stubRoute)
    vi.mocked(fetchMyRoute).mockResolvedValue(owned())
    vi.mocked(deleteRoute).mockResolvedValue()
  })

  afterEach(() => {
    hosts.unmount()
    vi.restoreAllMocks()
  })

  describe('a new route', () => {
    it('shows where it sits: a new route, under My authoring', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new')
      expect(wrapper.get('h1').text()).toBe('New route')
      expect(breadcrumbTrail(wrapper)).toEqual([
        ['My authoring', '/authoring'],
        ['New route', null],
      ])
      expect(wrapper.find('[data-testid="route-actions"]').exists()).toBe(false)
    })

    it('offers the six modes, rail first, and runs both ways by default', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new')
      const options = wrapper.findAll('[data-testid="route-mode"] option').map((o) => o.attributes('value'))
      expect(options).toEqual(['rail', 'metro', 'tram', 'bus', 'ferry', 'funicular'])
      expect((wrapper.get('[data-testid="route-mode"]').element as HTMLSelectElement).value).toBe('rail')
      expect((wrapper.get('[data-testid="route-bidirectional"]').element as HTMLInputElement).checked).toBe(true)
    })

    it('reads the pasted GeoJSON into the stats and the map preview', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new')
      expect(wrapper.get('[data-testid="route-stats"]').text()).toBe('No shape yet.')

      await pasteLine(wrapper)

      expect(wrapper.get('[data-testid="route-stats"]').text()).toMatch(/^2 points · 6\d\.\d km$/)
      expect(wrapper.get('[data-testid="import-note"]').text()).toBe('Imported 2 points from the pasted GeoJSON.')
      const routes = mapStub(wrapper).props('routes') as Route[]
      expect(routes).toHaveLength(1)
      expect(routes[0].geometry.coordinates).toEqual(sfToSj)
      expect((wrapper.get('[data-testid="route-geojson-text"]').element as HTMLTextAreaElement).value).toBe('')
    })

    it('reads an imported file the same way', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new')
      const input = wrapper.get('[data-testid="route-file"]')
      const file = new File([lineText], 'spine.geojson', { type: 'application/geo+json' })
      Object.defineProperty(input.element, 'files', { value: [file], configurable: true })

      await input.trigger('change')
      await flushPromises()

      expect(wrapper.get('[data-testid="import-note"]').text()).toBe('Imported 2 points from spine.geojson.')
      expect(wrapper.get('[data-testid="route-stats"]').text()).toContain('2 points')
    })

    it('says what was wrong with an import it could not read, as an alert', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new')
      await pasteLine(wrapper, JSON.stringify({ type: 'MultiLineString', coordinates: [sfToSj, sfToSj] }))
      const error = wrapper.get('[data-testid="import-error"]')
      expect(error.attributes('role')).toBe('alert')
      expect(error.text()).toBe('Only a single line can be imported.')
      expect(wrapper.find('[data-testid="import-note"]').exists()).toBe(false)
    })

    it('shows a validation fault as an alert and keeps the button off until it is fixed', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new')
      await pasteLine(wrapper, JSON.stringify({ type: 'LineString', coordinates: [sfToSj[0]] }))
      const fault = wrapper.get('[data-testid="validation-error"]')
      expect(fault.attributes('role')).toBe('alert')
      expect(fault.text()).toBe('The route needs at least two points.')
      expect(wrapper.get('[data-testid="submit"]').attributes('disabled')).toBeDefined()

      await pasteLine(wrapper)
      await wrapper.get('[data-testid="route-name"]').setValue('Main Line')
      expect(wrapper.find('[data-testid="validation-error"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="submit"]').attributes('disabled')).toBeUndefined()
    })

    it('creates the route and replaces the form with its editor', async () => {
      const { wrapper, router } = await mountAt('/authoring/routes/new')
      const replace = vi.spyOn(router, 'replace')
      await pasteLine(wrapper)
      await wrapper.get('[data-testid="route-name"]').setValue('Main Line')
      await wrapper.get('[data-testid="route-mode"]').setValue('tram')
      await wrapper.get('[data-testid="route-description"]').setValue('The spine')

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(createRoute).toHaveBeenCalledWith({
        type: 'LineString',
        coordinates: sfToSj,
        properties: { name: 'Main Line', description: 'The spine', mode: 'tram', bidirectional: true },
      })
      expect(hosts.toasts()).toEqual(['Route created'])
      expect(replace).toHaveBeenCalledWith('/authoring/routes/main-line')
      expect(router.currentRoute.value.path).toBe('/authoring/routes/main-line')
    })

    it('goes back where it was sent from, with the new route picked, when a return path is given', async () => {
      const { wrapper, router } = await mountAt('/authoring/routes/new?return=%2Fauthoring%2Fservices%2Fnew')
      await pasteLine(wrapper)
      await wrapper.get('[data-testid="route-name"]').setValue('Main Line')

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(router.currentRoute.value.path).toBe('/authoring/services/new')
      expect(router.currentRoute.value.query).toEqual({ route: 'main-line' })
    })

    it('keeps a return path\'s own query and ignores one that leaves the site', async () => {
      const back = encodeURIComponent('/authoring/services/northbound-express/edit?tab=stops')
      const { wrapper, router } = await mountAt(`/authoring/routes/new?return=${back}`)
      await pasteLine(wrapper)
      await wrapper.get('[data-testid="route-name"]').setValue('Main Line')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(router.currentRoute.value.fullPath).toBe('/authoring/services/northbound-express/edit?tab=stops&route=main-line')

      const { wrapper: other, router: otherRouter } = await mountAt('/authoring/routes/new?return=//evil.example')
      await pasteLine(other)
      await other.get('[data-testid="route-name"]').setValue('Main Line')
      await other.get('form').trigger('submit')
      await flushPromises()
      expect(otherRouter.currentRoute.value.path).toBe('/authoring/routes/main-line')
    })

    it('words a refused create as an alert and stays put', async () => {
      vi.mocked(createRoute).mockRejectedValue(new ApiError('POST failed: 500', 500))
      const { wrapper, router } = await mountAt('/authoring/routes/new')
      await pasteLine(wrapper)
      await wrapper.get('[data-testid="route-name"]').setValue('Main Line')

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(wrapper.get('[data-testid="submit-error"]').attributes('role')).toBe('alert')
      expect(wrapper.get('[data-testid="save-status"]').text()).toBe("Couldn't save")
      expect(router.currentRoute.value.path).toBe('/authoring/routes/new')
    })

    it('has no serious or critical accessibility violations with a line imported', async () => {
      const { wrapper } = await mountAt('/authoring/routes/new', undefined, document.body)
      await pasteLine(wrapper)
      expect(await seriousA11yViolations(wrapper)).toEqual([])
      wrapper.unmount()
    })
  })

  describe('editing a route', () => {
    it('shows a skeleton, not loading copy, while the route loads', async () => {
      vi.mocked(fetchMyRoute).mockReturnValue(new Promise(() => {}))
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line')
      const region = busyRegion(wrapper, 'route-loading')
      expect(visibleText(region)).toBe('')
    })

    it('fills the form from the route and names the page and the trail after it', async () => {
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line')
      expect(fetchMyRoute).toHaveBeenCalledWith('main-line')
      expect(wrapper.get('h1').text()).toBe('Edit route')
      expect(breadcrumbTrail(wrapper)).toEqual([
        ['My authoring', '/authoring'],
        ['Main Line', null],
        ['Edit', null],
      ])
      expect(document.title).toBe('Edit Main Line · Sparks Effect')
      expect((wrapper.get('[data-testid="route-name"]').element as HTMLInputElement).value).toBe('Main Line')
      expect((wrapper.get('[data-testid="route-description"]').element as HTMLTextAreaElement).value).toBe('The spine')
      expect(wrapper.get('[data-testid="route-stats"]').text()).toContain('2 points')
      expect(wrapper.get('[data-testid="save-status"]').text()).toBe('No changes')
      expect(wrapper.get('[data-testid="submit"]').attributes('disabled')).toBeDefined()
    })

    it('says when no route of mine matches', async () => {
      vi.mocked(fetchMyRoute).mockRejectedValue(new ApiError('not found', 404))
      const { wrapper } = await mountAt('/authoring/routes/nope', 'nope')
      expect(wrapper.get('[data-testid="route-not-found"]').text()).toContain('No route of yours matches "nope".')
      expect(wrapper.find('form').exists()).toBe(false)
    })

    it('reports a load that failed for another reason', async () => {
      vi.mocked(fetchMyRoute).mockRejectedValue(new Error('boom'))
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line')
      expect(wrapper.get('[data-testid="route-error"]').attributes('role')).toBe('alert')
    })

    it('saves a rename with a PUT, toasts, and stays on the editor', async () => {
      const { wrapper, router } = await mountAt('/authoring/routes/main-line', 'main-line')
      await wrapper.get('[data-testid="route-name"]').setValue('Spine')
      expect(wrapper.get('[data-testid="save-status"]').text()).toBe('Unsaved changes')
      vi.mocked(updateRoute).mockResolvedValue({ ...stubRoute, name: 'Spine' })

      await wrapper.get('form').trigger('submit')
      await flushPromises()

      expect(updateRoute).toHaveBeenCalledWith('main-line', expect.objectContaining({ properties: expect.objectContaining({ name: 'Spine' }) }))
      expect(hosts.toasts()).toEqual(['Changes saved'])
      expect(router.currentRoute.value.path).toBe('/authoring/routes/main-line')
      expect(wrapper.get('[data-testid="save-status"]').text()).toBe('No changes')
    })

    it('locks the shape, with the reason, while lines are built on it', async () => {
      vi.mocked(fetchMyRoute).mockResolvedValue(owned({ dependents: { services: 0, user_services: 2, segments: 0 } }))
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line')
      expect(wrapper.get('[data-testid="geometry-locked"]').text()).toBe(
        "Used by 2 lines — the shape can't change while lines are built on it. Name and details can.",
      )
      expect(wrapper.get('[data-testid="route-file"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="route-geojson-text"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="import-geojson"]').attributes('disabled')).toBeDefined()
      expect(wrapper.get('[data-testid="route-name"]').attributes('disabled')).toBeUndefined()
    })

    it('leaves the shape editable when the API did not say whether it is in use', async () => {
      vi.mocked(fetchMyRoute).mockResolvedValue(owned({ dependents: undefined }))
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line')
      expect(wrapper.find('[data-testid="geometry-locked"]').exists()).toBe(false)
      expect(wrapper.get('[data-testid="route-file"]').attributes('disabled')).toBeUndefined()
    })

    it('words a 409 route_in_use from the API as an alert', async () => {
      vi.mocked(updateRoute).mockRejectedValue(
        new ApiError('PUT failed: 409', 409, 'route_in_use', { services: 1, user_services: 0, segments: 0 }),
      )
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line')
      await wrapper.get('[data-testid="route-name"]').setValue('Spine')
      await wrapper.get('form').trigger('submit')
      await flushPromises()
      expect(wrapper.get('[data-testid="submit-error"]').text()).toBe('Used by 1 line. Move it to another route first.')
    })

    it('offers deletion behind More, asks first, and goes to My authoring once done', async () => {
      const { settle } = useConfirmHost()
      const { wrapper, router } = await mountAt('/authoring/routes/main-line', 'main-line')
      const menu = wrapper.get('[data-testid="route-actions"]')
      expect(menu.get('[data-testid="delete-route"]').text()).toBe('Delete route')

      await menu.get('[data-testid="delete-route"]').trigger('click')
      await flushPromises()
      expect(hosts.dialog().text()).toContain("Delete 'Main Line'?")
      settle(true)
      await flushPromises()

      expect(deleteRoute).toHaveBeenCalledWith('main-line')
      expect(router.currentRoute.value.path).toBe('/authoring')
    })

    it('has no serious or critical accessibility violations', async () => {
      const { wrapper } = await mountAt('/authoring/routes/main-line', 'main-line', document.body)
      expect(await seriousA11yViolations(wrapper)).toEqual([])
      wrapper.unmount()
    })
  })
})
