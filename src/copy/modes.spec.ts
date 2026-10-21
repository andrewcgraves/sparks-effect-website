// @vitest-environment node

import { describe, expect, it } from 'vitest'
import { TRAVEL_MODES } from '../api/authoring/types'
import { MODE_LABELS, MODE_TRIPS, modeLabel } from './modes'

describe('mode copy', () => {
  it.each(TRAVEL_MODES)('labels %s once, for every surface', (mode) => {
    expect(modeLabel(mode)).toBe(MODE_LABELS[mode])
    expect(MODE_TRIPS[mode]).toBeTruthy()
  })

  it('prints a mode this build has no label for as sent', () => {
    expect(modeLabel('teleport')).toBe('teleport')
  })

  it('does not read a label off the object prototype', () => {
    expect(modeLabel('toString')).toBe('toString')
  })
})
