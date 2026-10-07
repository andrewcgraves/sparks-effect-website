import type { App } from 'vue'
import type { Router } from 'vue-router'
import { getWebInstrumentations, initializeFaro } from '@grafana/faro-web-sdk'
import { configureErrorSink, reportError } from './index'
import { environmentFor } from './environment'
import { scrubItem } from './scrub'
import { FARO_APP_NAME } from './appName'

export interface FaroOptions {
  collectorUrl: string
  release: string
  // Read on every send rather than once, so a token issued after boot is
  // still known to the scrubber.
  sessionToken: () => string | null
}

// The pattern (`/welcome/:token`), never the path a visitor is on: it groups
// reports by page and cannot carry the token a set-password link does.
function routePattern(router: Router): string {
  const matched = router.currentRoute.value.matched
  return matched[matched.length - 1]?.path ?? 'unmatched'
}

// Grafana Cloud Frontend Observability, so the website's errors land beside
// the API's and the worker's, and alert from the same place (SPA-380).
export function startErrorReporting(app: App, router: Router, options: FaroOptions): void {
  const faro = initializeFaro({
    url: options.collectorUrl,
    app: {
      name: FARO_APP_NAME,
      version: options.release,
      environment: environmentFor(window.location.hostname),
    },
    // Errors, sessions and views only. Console capture would forward whatever
    // a component logged, and performance timings are not what this is for.
    instrumentations: getWebInstrumentations({ captureConsole: false, enablePerformanceInstrumentation: false }),
    beforeSend: (item) => {
      const token = options.sessionToken()
      return scrubItem(item, token ? [token] : [])
    },
  })

  configureErrorSink(({ error, context }) => {
    faro.api.pushError(error instanceof Error ? error : new Error(String(error)), {
      context: { route: routePattern(router), ...context },
    })
  })

  // Replacing Vue's handler also replaces its console output, so it is kept.
  app.config.errorHandler = (error, _instance, info) => {
    reportError(error, { vue_info: info })
    console.error(error)
  }

  router.afterEach(() => {
    faro.api.setView({ name: routePattern(router) })
  })
}
