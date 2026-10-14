import { onMounted, onScopeDispose, ref, type Ref } from 'vue'

// Tailwind's `lg` (64rem): the width from which the tour sets its map beside
// the steps rather than over them.
export const TOUR_WIDE_QUERY = '(min-width: 64rem)'
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)'

export function matchesMedia(query: string): boolean {
  return window.matchMedia?.(query).matches ?? false
}

const PHONE_FALLBACK_MARGIN = '-66% 0px -26% 0px'

export function useScrollSteps(items: Ref<HTMLElement[]>, options: { band?: Ref<HTMLElement | null> } = {}) {
  const active = ref<number | null>(null)
  let observer: IntersectionObserver | null = null
  let wide: MediaQueryList | null = null
  let chosen: { index: number; until: number } | null = null

  function onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const index = Number((entry.target as HTMLElement).dataset.stepIndex)
      // A step chosen from its button scrolls the page, and the steps in
      // between cross the reading band on the way; they are not being read.
      if (chosen && Date.now() < chosen.until && index !== chosen.index) continue
      chosen = null
      active.value = index
    }
  }

  function phoneMargin(): string {
    // On a phone the map is a band pinned under the header, so the reading
    // band is the strip just beneath it, where a card's heading arrives as it
    // comes out from under the map.
    const band = options.band?.value
    if (!band || band.offsetHeight === 0) return PHONE_FALLBACK_MARGIN
    const top = (parseFloat(getComputedStyle(band).top) || 0) + band.offsetHeight + 8
    const depth = Math.round(window.innerHeight * 0.08)
    return `-${Math.round(top)}px 0px -${Math.max(0, Math.round(window.innerHeight - top - depth))}px 0px`
  }

  function observe(): void {
    observer?.disconnect()
    if (typeof IntersectionObserver === 'undefined') return
    // Beside the map the band is the middle of the screen. Leaving the band
    // never clears the step: the last one read stays lit.
    const rootMargin = wide?.matches ? '-45% 0px -45% 0px' : phoneMargin()
    observer = new IntersectionObserver(onIntersect, { rootMargin })
    for (const item of items.value) if (item) observer.observe(item)
  }

  function choose(index: number, via: 'click' | 'focus' = 'click'): void {
    if (active.value === index) return
    active.value = index
    // Long enough for a smooth scroll across the steps in between to finish.
    chosen = { index, until: Date.now() + 1200 }
    // Beside the map a step is read in the middle of the screen; on a phone,
    // at the top of the strip under the map, which the step's scroll margin
    // keeps it below. Focus has already moved the page once, so the second
    // move is a jump rather than another glide.
    items.value[index]?.scrollIntoView?.({
      block: wide?.matches ? 'center' : 'start',
      behavior: via === 'focus' || matchesMedia(REDUCED_MOTION_QUERY) ? 'auto' : 'smooth',
    })
  }

  function onResize(): void {
    if (!wide?.matches) observe()
  }

  onMounted(() => {
    wide = window.matchMedia?.(TOUR_WIDE_QUERY) ?? null
    wide?.addEventListener('change', observe)
    window.addEventListener('resize', onResize)
    observe()
  })

  onScopeDispose(() => {
    observer?.disconnect()
    wide?.removeEventListener('change', observe)
    window.removeEventListener('resize', onResize)
  })

  return { active, choose }
}
