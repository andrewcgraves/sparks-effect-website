import { onMounted, onScopeDispose, ref, type Ref } from 'vue'

const WIDE = '(min-width: 64rem)'
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'
// How long a chosen step holds against the steps a scroll to it passes over.
const CHOSEN_HOLD_MS = 1200

export function useScrollSteps(items: Ref<HTMLElement[]>) {
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

  function observe(): void {
    observer?.disconnect()
    if (typeof IntersectionObserver === 'undefined') return
    // Beside the map the band is the middle of the screen. On a phone the map
    // and header take the top 63–65%, so the band sits just under them, where
    // a card's heading arrives as it comes out from beneath the map. Leaving
    // the band never clears the step: the last one read stays lit.
    const rootMargin = wide?.matches ? '-45% 0px -45% 0px' : '-66% 0px -26% 0px'
    observer = new IntersectionObserver(onIntersect, { rootMargin })
    for (const item of items.value) if (item) observer.observe(item)
  }

  function choose(index: number): void {
    if (active.value === index) return
    active.value = index
    chosen = { index, until: Date.now() + CHOSEN_HOLD_MS }
    const reduced = typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches
    // Beside the map a step is read in the middle of the screen; on a phone,
    // at the top of the strip under the map, which the step's scroll margin
    // keeps it below.
    items.value[index]?.scrollIntoView?.({
      block: wide?.matches ? 'center' : 'start',
      behavior: reduced ? 'auto' : 'smooth',
    })
  }

  onMounted(() => {
    wide = typeof matchMedia === 'function' ? matchMedia(WIDE) : null
    wide?.addEventListener('change', observe)
    observe()
  })

  onScopeDispose(() => {
    observer?.disconnect()
    wide?.removeEventListener('change', observe)
  })

  return { active, choose }
}
