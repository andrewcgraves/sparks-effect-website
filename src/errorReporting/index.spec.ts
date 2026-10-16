import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as ErrorReporting from './index'

let errors: typeof ErrorReporting

beforeEach(async () => {
  vi.resetModules()
  errors = await import('./index')
})

describe('reports made before the error tracker starts', () => {
  it('are delivered to the tracker once it starts', () => {
    errors.bufferErrorReports()
    const early = new Error('first render failed')
    errors.reportError(early, { vue_info: 'render function' })

    const delivered: ErrorReporting.ErrorReport[] = []
    errors.configureErrorSink((report) => delivered.push(report))

    expect(delivered).toEqual([{ error: early, context: { vue_info: 'render function' } }])
  })
})

describe('uncaught errors before the error tracker starts', () => {
  function rejection(reason: unknown): Event {
    return Object.assign(new Event('unhandledrejection'), { reason })
  }

  it('reports thrown errors and unhandled rejections to the tracker once it starts', () => {
    errors.bufferErrorReports()
    errors.captureUncaughtErrors(window)
    const thrown = new Error('chunk failed to load')
    window.dispatchEvent(new ErrorEvent('error', { error: thrown, message: thrown.message }))
    window.dispatchEvent(rejection('session refresh rejected'))

    const delivered: ErrorReporting.ErrorReport[] = []
    errors.configureErrorSink((report) => delivered.push(report))

    expect(delivered).toEqual([
      { error: thrown, context: { source: 'window.error' } },
      { error: 'session refresh rejected', context: { source: 'unhandledrejection' } },
    ])
  })

  it('stops listening once released, leaving them to the tracker', () => {
    errors.bufferErrorReports()
    const release = errors.captureUncaughtErrors(window)
    release()
    window.dispatchEvent(new ErrorEvent('error', { error: new Error('after Faro'), message: 'after Faro' }))
    window.dispatchEvent(rejection('after Faro'))

    const delivered: ErrorReporting.ErrorReport[] = []
    errors.configureErrorSink((report) => delivered.push(report))

    expect(delivered).toEqual([])
  })
})
