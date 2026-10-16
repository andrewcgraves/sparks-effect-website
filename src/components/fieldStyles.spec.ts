import { describe, expect, it } from 'vitest'
import { FIELD_INPUT_CLASS, FIELD_LABEL_CLASS } from './fieldStyles'

describe('fieldStyles', () => {
  it('resets the tracking a control inherits from the micro label around it', () => {
    // Preflight makes form controls inherit letter-spacing, and most fields sit
    // inside FIELD_LABEL_CLASS, whose text-micro carries 0.12em tracking.
    expect(FIELD_LABEL_CLASS.split(' ')).toContain('text-micro')
    expect(FIELD_INPUT_CLASS.split(' ')).toContain('tracking-normal')
  })
})
