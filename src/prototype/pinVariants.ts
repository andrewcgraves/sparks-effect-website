// PROTOTYPE — throwaway. Four renderings of the starting-point pin, switchable
// with `?variant=` on any map page (network page, a line's page, a route page)
// via the dev-only PrototypeSwitcher. Answers: "what should the pin look like?"
// Fold the winner into useOriginMarker.ts and delete this directory.
import { Marker, type MarkerOptions } from 'maplibre-gl'
import { readThemeToken } from '../themeTokens'
import { pinVariantKey } from './pinVariantState'

export { pinVariantKey }

export interface PinVariant {
  key: string
  build: () => Marker
}

function element(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html.trim()
  return el
}

function custom(html: string, options: Omit<MarkerOptions, 'element'>): Marker {
  return new Marker({ ...options, element: element(html) })
}

export const PIN_VARIANTS: PinVariant[] = [
  {
    key: 'A',
    build: () => new Marker({ color: readThemeToken('--color-coral') }),
  },
  {
    // Sits exactly on the point, so it hides nothing of the splash zone's
    // centre; the slow ring says "this is where it starts from".
    key: 'B',
    build: () =>
      custom(
        `<div class="relative grid size-10 place-items-center pointer-events-none">
          <span class="absolute size-10 rounded-full bg-coral/30 animate-ping [animation-duration:2.4s]"></span>
          <span class="absolute size-7 rounded-full bg-coral/20"></span>
          <span class="relative size-4 rounded-full bg-coral ring-3 ring-white shadow-(--shadow-panel)"></span>
        </div>`,
        { anchor: 'center' },
      ),
  },
  {
    // Names itself: the pin is the one mark on the map a visitor placed, and
    // the copy elsewhere already calls it the starting point.
    key: 'C',
    build: () =>
      custom(
        `<div class="flex flex-col items-center pointer-events-none">
          <span class="font-display text-btn whitespace-nowrap rounded-full bg-ink px-3 py-1 text-white uppercase shadow-(--shadow-panel)">Start</span>
          <span class="h-3 w-0.5 bg-ink"></span>
          <span class="size-2.5 rounded-full border-2 border-white shadow" style="background: var(--color-coral)"></span>
        </div>`,
        { anchor: 'bottom' },
      ),
  },
  {
    // A reticle: no fill over the map at all, only where exactly the walk
    // begins. White halo keeps it legible on dark roads and the coral fill.
    key: 'D',
    build: () =>
      custom(
        `<svg width="44" height="44" viewBox="0 0 44 44" class="pointer-events-none" aria-hidden="true">
          <g stroke="white" stroke-width="5" stroke-linecap="round" fill="none">
            <circle cx="22" cy="22" r="11"/>
            <path d="M22 3v9M22 32v9M3 22h9M32 22h9"/>
          </g>
          <g stroke="var(--color-ink)" stroke-width="2" stroke-linecap="round" fill="none">
            <circle cx="22" cy="22" r="11"/>
            <path d="M22 3v9M22 32v9M3 22h9M32 22h9"/>
          </g>
          <circle cx="22" cy="22" r="3.5" fill="var(--color-coral)" stroke="white" stroke-width="1.5"/>
        </svg>`,
        { anchor: 'center' },
      ),
  },
]

export function currentPinVariant(): PinVariant {
  return PIN_VARIANTS.find((v) => v.key === pinVariantKey.value) ?? PIN_VARIANTS[0]
}
