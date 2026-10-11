import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import SiteFooter from './SiteFooter.vue'

const Blank = { template: '<div />' }

function mountFooter(routes: RouteRecordRaw[] = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Blank }, ...routes],
  })
  return mount(SiteFooter, { global: { plugins: [router] } })
}

describe('SiteFooter', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('credits OpenStreetMap for the map data', () => {
    const osm = mountFooter().get('a[href="https://www.openstreetmap.org/copyright"]')
    expect(osm.text()).toBe('OpenStreetMap')
  })

  it('credits OpenFreeMap for tiles when no Stadia key is configured', () => {
    vi.stubEnv('VITE_STADIA_API_KEY', '')
    const credit = mountFooter().get('[data-testid="tile-credit"]')
    expect(credit.text()).toBe('OpenFreeMap')
    expect(credit.attributes('href')).toBe('https://openfreemap.org')
  })

  it('credits Stadia Maps for tiles when a Stadia key is configured', () => {
    vi.stubEnv('VITE_STADIA_API_KEY', 'test-key')
    const credit = mountFooter().get('[data-testid="tile-credit"]')
    expect(credit.text()).toBe('Stadia Maps')
    expect(credit.attributes('href')).toBe('https://stadiamaps.com')
  })

  // Address search runs on Stadia whichever tiles are shown; its attribution
  // page lists the data sources behind the results.
  it('credits Stadia Maps for address search', () => {
    vi.stubEnv('VITE_STADIA_API_KEY', '')
    const credit = mountFooter().get('[data-testid="geocoder-credit"]')
    expect(credit.text()).toBe('Stadia Maps')
    expect(credit.attributes('href')).toBe('https://stadiamaps.com/attribution/')
  })

  it('shows the build version', () => {
    expect(mountFooter().get('[data-testid="build-version"]').text()).toBe(`Build ${__BUILD_VERSION__}`)
  })

  it('links no pages that do not exist yet', () => {
    expect(mountFooter().findAll('[data-testid="footer-links"] a')).toHaveLength(0)
  })

  it('links each page once its route exists, in a fixed order', () => {
    const wrapper = mountFooter([
      { path: '/report', component: Blank },
      { path: '/attribution', component: Blank },
      { path: '/privacy', component: Blank },
      { path: '/terms', component: Blank },
      { path: '/how-it-works', component: Blank },
    ])
    const links = wrapper.findAll('[data-testid="footer-links"] a')
    expect(links.map((link) => [link.text(), link.attributes('href')])).toEqual([
      ['How it works', '/how-it-works'],
      ['Privacy', '/privacy'],
      ['Terms', '/terms'],
      ['Attribution', '/attribution'],
      ['Report a problem', '/report'],
    ])
  })

  it('links only the pages whose routes exist', () => {
    const wrapper = mountFooter([{ path: '/terms', component: Blank }])
    const links = wrapper.findAll('[data-testid="footer-links"] a')
    expect(links.map((link) => link.text())).toEqual(['Terms'])
  })
})
