import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SampleMap from './SampleMap.vue'
import { SAMPLE_MAP_PARTS } from './sampleMapData'

const part = (wrapper: ReturnType<typeof mount>, name: string) => wrapper.get(`[data-part="${name}"]`)

describe('SampleMap', () => {
  it('draws every part of a plot, as one image with a name and a description', () => {
    const wrapper = mount(SampleMap, { props: { focus: null } })
    for (const name of SAMPLE_MAP_PARTS) expect(wrapper.find(`[data-part="${name}"]`).exists()).toBe(true)

    const svg = wrapper.get('[data-testid="sample-map"]')
    expect(svg.attributes('role')).toBe('img')
    const [titleId, descId] = svg.attributes('aria-labelledby')!.split(' ')
    expect(svg.get(`title#${titleId}`).text()).not.toBe('')
    const desc = svg.get(`desc#${descId}`).text()
    for (const name of ['Origin reach', 'From station', 'Ridden', 'Unridden', 'Unfinished']) {
      expect(desc).toContain(name)
    }
  })

  it('paints each part as the map paints the layer it stands for', () => {
    const wrapper = mount(SampleMap, { props: { focus: null } })
    for (const fill of [
      ...part(wrapper, 'origin-fill').findAll('path'),
      ...part(wrapper, 'egress-fill').findAll('path'),
    ]) {
      expect(fill.attributes('fill-opacity')).toBe('0.35')
    }
    expect(part(wrapper, 'origin-fill').get('path').attributes('fill')).toBe('#1034b1')
    expect(part(wrapper, 'egress-fill').get('path').attributes('fill')).toBe('#f28f29')

    const route = part(wrapper, 'route-line').get('path:not([stroke="transparent"])')
    expect(route.attributes()).toMatchObject({ 'stroke': '#b8b8be', 'stroke-width': '2.5' })
    const ridden = part(wrapper, 'ridden-line').get('path:not([stroke="transparent"])')
    expect(ridden.attributes()).toMatchObject({ 'stroke': '#121212', 'stroke-width': '2.5' })
    const stub = part(wrapper, 'progress-line').get('path:not([stroke="transparent"])')
    expect(stub.attributes()).toMatchObject({ 'stroke': '#121212', 'stroke-width': '2.5', 'stroke-dasharray': '2.5 8.75' })
    const walk = part(wrapper, 'origin-walk').get('path:not([stroke="transparent"])')
    expect(walk.attributes()).toMatchObject({ 'stroke': '#1034b1', 'stroke-width': '2', 'stroke-dasharray': '2 4' })

    const cap = part(wrapper, 'progress-cap').get('circle:not([fill="transparent"])')
    expect(cap.attributes()).toMatchObject({ r: '3.5', fill: '#121212' })

    const dots = part(wrapper, 'station-dots').findAll('circle')
    for (const dot of dots) {
      expect(dot.attributes()).toMatchObject({ 'r': '5', 'stroke': '#121212', 'stroke-width': '2' })
    }
    expect(dots.map((dot) => dot.attributes('fill'))).toEqual(
      expect.arrayContaining(['#f28f29', '#ffffff']),
    )
  })

  it('lights only the parts in focus, and everything with no focus', async () => {
    const wrapper = mount(SampleMap, { props: { focus: ['origin-fill'] } })
    const lit = () => SAMPLE_MAP_PARTS.filter((name) => part(wrapper, name).attributes('data-lit') === 'true')
    expect(lit()).toEqual(['origin-fill'])

    await wrapper.setProps({ focus: null })
    expect(lit()).toEqual([...SAMPLE_MAP_PARTS])
  })

  it('reports which part was clicked', async () => {
    const wrapper = mount(SampleMap, { props: { focus: null } })
    await part(wrapper, 'ridden-line').trigger('click')
    expect(wrapper.emitted('select-part')).toEqual([['ridden-line']])
  })
})
