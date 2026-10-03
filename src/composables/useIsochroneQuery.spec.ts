import { describe, expect, it, vi } from 'vitest'
import { defineComponent, ref, type Ref } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { useIsochroneQuery } from './useIsochroneQuery'
import type { SplashZone } from '../splashQuery'

interface Harness {
  plot: ReturnType<typeof vi.fn<(zone: SplashZone) => Promise<void>>>
  plotted: Ref<boolean>
  ready: Ref<boolean>
}

async function setup(path: string, { ready = true, plotted = true } = {}) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/scenario/:slug', component: { template: '<div />' } }],
  })
  await router.push(path)
  await router.isReady()

  const harness: Harness = {
    plot: vi.fn<(zone: SplashZone) => Promise<void>>().mockResolvedValue(undefined),
    plotted: ref(plotted),
    ready: ref(ready),
  }
  let query!: ReturnType<typeof useIsochroneQuery>
  const Host = defineComponent({
    setup() {
      query = useIsochroneQuery({
        plot: harness.plot,
        plotted: () => harness.plotted.value,
        ready: () => harness.ready.value,
      })
      return () => null
    },
  })
  mount(Host, { global: { plugins: [router] } })
  await flushPromises()
  return { router, harness, query }
}

const zone: SplashZone = { lat: 37.33821, lng: -121.88635, mode: 'transit', duration: 60 }

describe('useIsochroneQuery', () => {
  it('reads the form\'s starting values from the link', async () => {
    const { query } = await setup('/scenario/ca-hsr?at=37.3382,-121.8863&mode=transit&mins=60')
    expect(query.initial).toEqual({ lat: 37.3382, lng: -121.8863, mode: 'transit', duration: 60 })
  })

  it('plots the linked splash zone once on load', async () => {
    const { harness } = await setup('/scenario/ca-hsr?at=37.3382,-121.8863&mode=transit&mins=60')
    expect(harness.plot).toHaveBeenCalledTimes(1)
    expect(harness.plot).toHaveBeenCalledWith({ lat: 37.3382, lng: -121.8863, mode: 'transit', duration: 60 })
  })

  it('fills a linked origin\'s missing mode and budget with the form\'s defaults', async () => {
    const { harness } = await setup('/scenario/ca-hsr?at=37.3382,-121.8863&mode=teleport')
    expect(harness.plot).toHaveBeenCalledWith({ lat: 37.3382, lng: -121.8863, mode: 'walk', duration: 60 })
  })

  it('plots nothing on load without a usable origin', async () => {
    const { harness, query } = await setup('/scenario/ca-hsr?at=999,0&mode=bike&mins=45')
    expect(harness.plot).not.toHaveBeenCalled()
    expect(query.initial).toEqual({ mode: 'bike', duration: 45 })
  })

  it('waits for the page to be ready before plotting, and plots only once', async () => {
    const { harness } = await setup('/scenario/ca-hsr?at=1,2', { ready: false })
    expect(harness.plot).not.toHaveBeenCalled()

    harness.ready.value = true
    await flushPromises()
    harness.ready.value = false
    await flushPromises()
    harness.ready.value = true
    await flushPromises()
    expect(harness.plot).toHaveBeenCalledTimes(1)
  })

  it('writes a successful plot into the URL, replacing the history entry', async () => {
    const { router, query } = await setup('/scenario/ca-hsr?ref=newsletter')
    const push = vi.spyOn(router, 'push')
    await query.submit({ ...zone, lat: 37.338212345 })
    expect(push).not.toHaveBeenCalled()
    expect(router.currentRoute.value.query).toEqual({
      ref: 'newsletter',
      at: '37.33821,-121.88635',
      mode: 'transit',
      mins: '60',
    })
  })

  it('leaves the URL alone when the plot fails', async () => {
    const { router, harness, query } = await setup('/scenario/ca-hsr')
    harness.plotted.value = false
    await query.submit(zone)
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('writes only the latest of two overlapping plots', async () => {
    const { router, harness, query } = await setup('/scenario/ca-hsr')
    let finishFirst!: () => void
    harness.plot.mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirst = resolve }))
    const first = query.submit({ ...zone, mode: 'walk' })
    await query.submit({ ...zone, mode: 'bike' })
    finishFirst()
    await first
    await flushPromises()
    expect(router.currentRoute.value.query.mode).toBe('bike')
  })

  it('is shareable only once the URL names a splash zone', async () => {
    const { query } = await setup('/scenario/ca-hsr')
    expect(query.shareable.value).toBe(false)
    await query.submit(zone)
    expect(query.shareable.value).toBe(true)
  })

  it('forgets the splash zone, keeping the rest of the query, and outlives a plot still in flight', async () => {
    const { router, harness, query } = await setup('/scenario/ca-hsr?ref=newsletter&at=1,2&mode=walk&mins=45')
    let finish!: () => void
    harness.plot.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    const inFlight = query.submit(zone)
    await query.forget()
    finish()
    await inFlight
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ ref: 'newsletter' })
    expect(query.shareable.value).toBe(false)
  })
})
