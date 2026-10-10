import { afterEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import AttributionView from './AttributionView.vue'
import { CONTACT_EMAIL } from '../legal/contact'
import { seriousA11yViolations } from '../test/axe'

const Blank = { template: '<div />' }

async function mountView(attachTo?: Element) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: Blank }, { path: '/attribution', component: AttributionView }],
  })
  await router.push('/attribution')
  await router.isReady()
  return mount(AttributionView, { global: { plugins: [router] }, attachTo })
}

function hrefs(wrapper: Awaited<ReturnType<typeof mountView>>): string[] {
  return wrapper.findAll('a').map((a) => a.attributes('href') ?? '')
}

describe('AttributionView', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is a dated attribution page', async () => {
    const wrapper = await mountView()
    expect(wrapper.get('h1').text()).toBe('Attribution')
    expect(wrapper.get('[data-testid="page-updated"] time').attributes('datetime')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('has a section per kind of source, each anchored for the footer and the map to link', async () => {
    const headings = (await mountView()).findAll('h2')
    expect(headings.map((h) => [h.attributes('id'), h.text()])).toEqual([
      ['map', 'Map'],
      ['routing-graph', 'Street network and routing'],
      ['transit-schedules', 'Transit schedules'],
      ['address-search', 'Address search'],
      ['proposed-lines', 'Proposed lines'],
      ['software', 'Software and fonts'],
    ])
  })

  it('credits OpenStreetMap under the ODbL, and the tile schema and style lineage', async () => {
    const links = hrefs(await mountView())
    expect(links).toContain('https://www.openstreetmap.org/copyright')
    expect(links).toContain('https://opendatacommons.org/licenses/odbl/1-0/')
    expect(links).toContain('https://openmaptiles.org/')
    expect(links).toContain('https://github.com/CartoDB/CartoDB-basemaps')
  })

  it('credits OpenFreeMap for tiles by default, and Stadia Maps when a key is configured', async () => {
    vi.stubEnv('VITE_STADIA_API_KEY', '')
    expect((await mountView()).get('[data-testid="tile-credit"]').text()).toBe('OpenFreeMap')
    vi.stubEnv('VITE_STADIA_API_KEY', 'test-key')
    expect((await mountView()).get('[data-testid="tile-credit"]').text()).toBe('Stadia Maps')
  })

  it('states that the street network is an ODbL derivative and offers the build method', async () => {
    const wrapper = await mountView()
    const text = wrapper.text()
    expect(text).toMatch(/Derivative Database of OpenStreetMap/)
    expect(text).toMatch(/We do not edit OpenStreetMap data/)
    expect(text).toMatch(/available free on request/)
    expect(hrefs(wrapper)).toEqual(expect.arrayContaining([
      'https://github.com/valhalla/valhalla',
      'https://download.geofabrik.de/',
      'https://github.com/evansiroky/timezone-boundary-builder',
      'https://github.com/OpenStreetMapSpeeds/schema',
    ]))
  })

  it('credits 511 in its required words, linked', async () => {
    const credit = (await mountView()).get('[data-testid="attribution-511"]')
    expect(credit.text()).toBe('Data provided by 511.org')
    expect(credit.attributes('href')).toBe('https://www.511.org')
  })

  it('credits each feed whose licence asks for it', async () => {
    const wrapper = await mountView()
    const text = wrapper.text()
    const items = wrapper.get('#transit-schedules ~ ul').findAll('li').map((li) => li.text().replace(/\s+/g, ' '))
    // ODC-BY's own wording, the feeds joined as a sentence.
    expect(items[0]).toBe(
      'Contains information from the GTFS feeds of San Francisco Bay Ferry, MVgo, Mountain View Community Shuttle and El Monte Transit, which are made available under the ODC Attribution License.',
    )
    expect(items[1]).toBe(
      'Nevada County Connects (Gold Country Stage), Bellflower Bus, The Santa Cruzer: CC BY 4.0. Victor Valley Transit Authority: CC BY 3.0.',
    )
    expect(text).toMatch(/UCSC Transportation and Parking Services.*© 2025 PinpointAVL/s)
    expect(text).toMatch(/Santa Cruz METRO/)
    expect(text).toMatch(/wheelsbus\.com/)
    expect(text).toMatch(/Schedule data provided by LA Metro/)
    expect(text).toMatch(/Route and schedule data provided by permission of San Joaquin RTD/)
    expect(hrefs(wrapper)).toEqual(expect.arrayContaining([
      'https://opendatacommons.org/licenses/by/1-0/',
      'https://creativecommons.org/licenses/by/4.0/',
      'https://creativecommons.org/licenses/by/3.0/',
      'https://github.com/PinpointAVL/TAPS-GTFS/blob/main/LICENSE',
      'https://mobilitydatabase.org',
    ]))
  })

  it('says the schedules were changed, as CC BY asks, and disclaims any endorsement', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/These are changes to the original data/)
    expect(text).toMatch(/not affiliated with or endorsed by any transit agency/)
  })

  it('credits the geocoder and the sources behind it', async () => {
    const links = hrefs(await mountView())
    expect(links).toEqual(expect.arrayContaining([
      'https://stadiamaps.com/attribution/',
      'https://openaddresses.io/',
      'https://www.geonames.org/',
      'https://whosonfirst.org/docs/licenses/',
      'https://opensource.foursquare.com/os-places/',
    ]))
  })

  it('credits the high-speed rail planning data with its disclaimer, and the ODbL trace', async () => {
    const text = (await mountView()).text()
    expect(text).toMatch(/California High-Speed Rail Authority/)
    expect(text).toMatch(/preliminary planning data/)
    expect(text).toMatch(/Brightline West.*traced from OpenStreetMap/s)
    expect(text).toMatch(/High Desert Corridor/)
  })

  it('credits the map library and the fonts', async () => {
    const links = hrefs(await mountView())
    expect(links).toContain('https://maplibre.org/')
    expect(links).toContain('https://openfontlicense.org/')
  })

  it('gives an address to ask for the full agency list and the build details', async () => {
    expect(hrefs(await mountView())).toContain(`mailto:${CONTACT_EMAIL}`)
  })

  it('has no serious or critical accessibility violations', async () => {
    const wrapper = await mountView(document.body)
    expect(await seriousA11yViolations(wrapper)).toEqual([])
    wrapper.unmount()
  })
})
