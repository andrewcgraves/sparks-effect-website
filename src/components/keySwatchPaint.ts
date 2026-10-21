import { resolveIsochroneColors } from '../composables/useIsochroneLayer'
import { ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH } from '../composables/useOriginWalkLayer'
import {
  PROGRESS_CAP_RADIUS,
  PROGRESS_LINE_DASH,
  ROUTE_LINE_WIDTH,
  routeLineColor,
} from '../composables/useRouteLayer'
import { readThemeToken } from '../themeTokens'

export const KEY_SWATCH_KINDS = ['start', 'origin', 'egress', 'starter', 'unfinished', 'ridden', 'unridden'] as const

export type KeySwatchKind = (typeof KEY_SWATCH_KINDS)[number]

export function svgDash(dash: readonly number[], width: number): string {
  // MapLibre measures a dash in line widths; SVG measures it in pixels.
  return dash.map((d) => d * width).join(' ')
}

export function keySwatchPaint() {
  const { origin, egress } = resolveIsochroneColors()
  return {
    origin,
    egress,
    unridden: routeLineColor(true),
    ink: readThemeToken('--color-ink'),
    pin: readThemeToken('--color-coral'),
    lineWidth: ROUTE_LINE_WIDTH,
    progressDash: svgDash(PROGRESS_LINE_DASH, ROUTE_LINE_WIDTH),
    capRadius: PROGRESS_CAP_RADIUS,
    walkWidth: ORIGIN_WALK_LINE_WIDTH,
    walkDash: svgDash(ORIGIN_WALK_DASH, ORIGIN_WALK_LINE_WIDTH),
  }
}
