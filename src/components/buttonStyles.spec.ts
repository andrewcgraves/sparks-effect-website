import { describe, expect, it } from 'vitest'
import {
  DESTRUCTIVE_BUTTON_CLASS,
  PLACEMENT_TOGGLE_CLASS,
  PRESSED_CHOICE_CLASS,
  PRIMARY_BUTTON_CLASS,
  SELECTED_CHOICE_CLASS,
  TOGGLE_BUTTON_CLASS,
} from './buttonStyles'

function classes(classString: string): string[] {
  return classString.split(/\s+/)
}

describe('button styles', () => {
  it('fills the primary button ink under white text', () => {
    expect(classes(PRIMARY_BUTTON_CLASS)).toEqual(expect.arrayContaining(['bg-ink', 'text-white', 'hover:bg-ink-muted']))
    expect(PRIMARY_BUTTON_CLASS).not.toMatch(/\bbg-coral\b/)
  })

  it('fills the destructive button error red on hover', () => {
    expect(classes(DESTRUCTIVE_BUTTON_CLASS)).toEqual(expect.arrayContaining(['hover:bg-error', 'hover:text-white']))
  })

  it('selects a choice with the coral border and tint under ink text', () => {
    expect(classes(SELECTED_CHOICE_CLASS)).toEqual(['border-coral', 'bg-coral/10', 'text-ink'])
    expect(classes(PRESSED_CHOICE_CLASS)).toEqual(classes(SELECTED_CHOICE_CLASS).map((name) => `aria-pressed:${name}`))
  })

  it.each([PLACEMENT_TOGGLE_CLASS, TOGGLE_BUTTON_CLASS])('presses a toggle with the selected-choice classes', (toggle) => {
    expect(classes(toggle)).toEqual(expect.arrayContaining(classes(PRESSED_CHOICE_CLASS)))
    expect(classes(toggle)).not.toContain('aria-pressed:bg-coral')
  })
})
