import { afterEach, describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { useIsPhone } from './useIsPhone'

const DESKTOP_WIDTH = 1024

function resizeTo(width: number) {
  window.innerWidth = width
  window.dispatchEvent(new Event('resize'))
}

afterEach(() => {
  window.innerWidth = DESKTOP_WIDTH
})

describe('useIsPhone', () => {
  it('is a desktop at the default window width', () => {
    expect(useIsPhone().value).toBe(false)
  })

  it('is a phone when the window is narrower than md', () => {
    window.innerWidth = 390
    expect(useIsPhone().value).toBe(true)
  })

  it('is a desktop at exactly md', () => {
    window.innerWidth = 768
    expect(useIsPhone().value).toBe(false)
  })

  it('follows the window across the breakpoint', () => {
    const isPhone = useIsPhone()
    expect(isPhone.value).toBe(false)

    resizeTo(390)
    expect(isPhone.value).toBe(true)

    resizeTo(1024)
    expect(isPhone.value).toBe(false)
  })

  it('stops following once its scope is disposed', () => {
    const scope = effectScope()
    const isPhone = scope.run(() => useIsPhone())!
    scope.stop()

    resizeTo(390)
    expect(isPhone.value).toBe(false)
  })

  it('is a desktop where the browser has no matchMedia', () => {
    const matchMedia = window.matchMedia
    Object.defineProperty(window, 'matchMedia', { value: undefined, configurable: true, writable: true })
    try {
      window.innerWidth = 390
      expect(useIsPhone().value).toBe(false)
    } finally {
      Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true, writable: true })
    }
  })
})
