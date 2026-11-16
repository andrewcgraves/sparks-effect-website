// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { DEFAULT_PLOT_LABEL, formatPlotLabel } from './plotLabel'

describe('formatPlotLabel', () => {
  it('fills a network template with the minutes and the trip word', () => {
    const template = 'Show a {minutes}-minute HSR ride and {mode}'
    expect(formatPlotLabel(template, 60, 'walk')).toBe('Show a 60-minute HSR ride and walk')
    expect(formatPlotLabel(template, 90, 'bike')).toBe('Show a 90-minute HSR ride and bike ride')
    expect(formatPlotLabel(template, 30, 'drive')).toBe('Show a 30-minute HSR ride and drive')
    expect(formatPlotLabel(template, 120, 'transit')).toBe('Show a 120-minute HSR ride and transit trip')
  })

  it('reads the default wording when a network sets none', () => {
    expect(DEFAULT_PLOT_LABEL).toBe('Plot a {minutes}-min {mode}')
    expect(formatPlotLabel(undefined, 60, 'walk')).toBe('Plot a 60-min walk')
    expect(formatPlotLabel('', 60, 'walk')).toBe('Plot a 60-min walk')
    expect(formatPlotLabel('   ', 120, 'transit')).toBe('Plot a 120-min transit trip')
  })

  it('keeps a template with no placeholders as written', () => {
    expect(formatPlotLabel('Show my splash zone', 60, 'walk')).toBe('Show my splash zone')
  })
})
