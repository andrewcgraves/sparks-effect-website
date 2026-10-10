import { computed, ref, watch, type ComputedRef, type Ref } from 'vue'

export interface PhoneMapTab {
  key: string
  label: string
  disabled?: boolean
}

// The tab the WAI-ARIA tabs pattern moves to for an arrow, Home or End key:
// the next enabled tab in that direction, wrapping at either end. Any other
// key is not the list's to handle.
export function tabForKey(tabs: readonly PhoneMapTab[], current: string, key: string): string | null {
  const enabled = tabs.filter((tab) => !tab.disabled)
  if (enabled.length === 0) return null
  const index = enabled.findIndex((tab) => tab.key === current)
  switch (key) {
    case 'ArrowRight':
      return enabled[(index + 1) % enabled.length].key
    case 'ArrowLeft':
      return enabled[(index - 1 + enabled.length) % enabled.length].key
    case 'Home':
      return enabled[0].key
    case 'End':
      return enabled[enabled.length - 1].key
    default:
      return null
  }
}

// The tabs of a page that plots, and the chosen one. Every such page has Plot
// and Results, Results waiting on a splash zone with stations to read; the
// host adds its own after them. The panel opens on Plot, turns to Results as
// soon as there are results — a plot is what the visitor came for — and comes
// back to Plot when the tab it was on goes away or is disabled: a refused plot
// clears the splash zone and explains why in the form, so an empty Results
// tab would hide the explanation.
export function usePhoneMapTabs(options: {
  results: () => boolean
  extra: () => PhoneMapTab[]
}): { tabs: ComputedRef<PhoneMapTab[]>; tab: Ref<string> } {
  const tabs = computed<PhoneMapTab[]>(() => [
    { key: 'plot', label: 'Plot' },
    { key: 'results', label: 'Results', disabled: !options.results() },
    ...options.extra(),
  ])
  const tab = ref('plot')

  watch(options.results, (hasResults) => {
    if (hasResults) tab.value = 'results'
  })

  watch(tabs, (current) => {
    if (!current.some((entry) => entry.key === tab.value && !entry.disabled)) tab.value = 'plot'
  })

  return { tabs, tab }
}
