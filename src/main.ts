import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { redirectAfterSessionExpiry, router } from './router'
import { installStores } from './stores/install'
import { persistedSessionToken } from './stores/auth'
import { configureSink } from './analytics/index'
import { vercelSink } from './analytics/sinks'
import { bufferErrorReports, captureUncaughtErrors, configureErrorSink, reportVueErrors } from './errorReporting/index'

if (import.meta.env.PROD) {
  configureSink(vercelSink)
}

const app = createApp(App)

const faroUrl = import.meta.env.PROD ? (import.meta.env.VITE_FARO_URL as string | undefined) : undefined
let releaseUncaughtErrors = () => {}
if (faroUrl) {
  bufferErrorReports()
  releaseUncaughtErrors = captureUncaughtErrors(window)
  reportVueErrors(app)
}

installStores(app, { onSessionExpired: () => void redirectAfterSessionExpiry(router) })
app.use(router).mount('#app')

// The Faro SDK is most of what the entry chunk would otherwise carry, so it
// loads after first render rather than ahead of it (SPA-493). What fails in
// between is buffered above and handed over when it starts.
if (faroUrl) {
  import('./errorReporting/faro')
    .then(({ startErrorReporting }) => {
      releaseUncaughtErrors()
      startErrorReporting(router, {
        collectorUrl: faroUrl,
        release: __BUILD_VERSION__,
        sessionToken: persistedSessionToken,
      })
    })
    // With no tracker to hand them to (offline, a blocked or replaced chunk),
    // the buffer would only grow, so it is dropped.
    .catch(() => {
      releaseUncaughtErrors()
      configureErrorSink(() => {})
    })
}
