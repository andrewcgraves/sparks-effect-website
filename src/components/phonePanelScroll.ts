import type { InjectionKey, Ref } from 'vue'

// A card inside the phone map page's panel lets the panel do the scrolling. A
// card that also capped and scrolled its own list put one scroller inside
// another, and a phone keeps a swipe in whichever one it started in: the list
// stopped at its end while the panel had more to show (SPA-508).
export const PHONE_PANEL_SCROLLER: InjectionKey<Readonly<Ref<HTMLElement | null>>> = Symbol('phonePanelScroller')

// Scrolls the one box the row sits in rather than calling scrollIntoView, which
// scrolls every scrollable ancestor, the window included.
export function revealWithin(scroller: HTMLElement | null, row: Element): void {
  if (!scroller) return
  const box = scroller.getBoundingClientRect()
  const rect = row.getBoundingClientRect()
  // A row on a panel tab that is not showing has no box. Measured anyway, it
  // reads as above the top, and scrolling for it would move the tab in view.
  if (rect.top === rect.bottom) return
  if (rect.top < box.top) scroller.scrollTop -= box.top - rect.top
  else if (rect.bottom > box.bottom) scroller.scrollTop += rect.bottom - box.bottom
}
