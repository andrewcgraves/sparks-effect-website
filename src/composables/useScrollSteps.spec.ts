import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useScrollSteps } from './useScrollSteps'

let observers: ObserverStub[] = []

class ObserverStub {
  observed: Element[] = []
  disconnect = vi.fn()
  callback: IntersectionObserverCallback
  options: IntersectionObserverInit
  constructor(callback: IntersectionObserverCallback, options: IntersectionObserverInit) {
    this.callback = callback
    this.options = options
    observers.push(this)
  }
  observe(el: Element) {
    this.observed.push(el)
  }
  fire(index: number) {
    const target = this.observed[index] as HTMLElement
    this.callback([{ isIntersecting: true, target } as unknown as IntersectionObserverEntry], this as unknown as IntersectionObserver)
  }
}

function stubMedia(desktop: boolean, reduced = false) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('min-width') ? desktop : query.includes('reduce') ? reduced : false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
}

function mountSteps(count = 3) {
  let api!: ReturnType<typeof useScrollSteps>
  const Host = defineComponent({
    setup() {
      const items = ref<HTMLElement[]>([])
      api = useScrollSteps(items)
      return () => h('ol', Array.from({ length: count }, (_, i) =>
        h('li', { ref: (el) => { if (el) items.value[i] = el as HTMLElement }, 'data-step-index': i }),
      ))
    },
  })
  const wrapper = mount(Host, { attachTo: document.body })
  return { wrapper, api }
}

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', ObserverStub)
  stubMedia(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.innerHTML = ''
})

describe('useScrollSteps', () => {
  it('starts on no step, and lights the step that scrolls into the reading band', async () => {
    const { api } = mountSteps()
    await nextTick()
    expect(api.active.value).toBeNull()
    observers[0].fire(2)
    expect(api.active.value).toBe(2)
  })

  it('reads in the middle of the screen beside a map, and below the map band on a phone', async () => {
    mountSteps()
    await nextTick()
    expect(observers[0].options.rootMargin).toBe('-45% 0px -45% 0px')

    observers = []
    stubMedia(false)
    mountSteps()
    await nextTick()
    expect(observers[0].options.rootMargin).toBe('-66% 0px -26% 0px')
  })

  it('brings a chosen step to the middle, and ignores the steps it scrolls past', async () => {
    const { api, wrapper } = mountSteps()
    await nextTick()
    const target = wrapper.findAll('li')[2].element as HTMLElement
    target.scrollIntoView = vi.fn()
    api.choose(2)
    expect(api.active.value).toBe(2)
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' })
    observers[0].fire(1)
    expect(api.active.value).toBe(2)
  })

  it('brings a chosen step to the top of the strip under the map on a phone', async () => {
    stubMedia(false)
    const { api, wrapper } = mountSteps()
    await nextTick()
    const target = wrapper.findAll('li')[1].element as HTMLElement
    target.scrollIntoView = vi.fn()
    api.choose(1)
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start', behavior: 'smooth' })
  })

  it('jumps rather than glides when motion is reduced', async () => {
    stubMedia(true, true)
    const { api, wrapper } = mountSteps()
    await nextTick()
    const target = wrapper.findAll('li')[1].element as HTMLElement
    target.scrollIntoView = vi.fn()
    api.choose(1)
    expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'center', behavior: 'auto' })
  })

  it('stops watching when the page goes', async () => {
    const { wrapper } = mountSteps()
    await nextTick()
    wrapper.unmount()
    expect(observers[0].disconnect).toHaveBeenCalled()
  })

  it('leaves every step unlit where scrolling cannot be watched', async () => {
    vi.stubGlobal('IntersectionObserver', undefined)
    const { api } = mountSteps()
    await nextTick()
    expect(api.active.value).toBeNull()
  })
})
