import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { redirectAfterSessionExpiry, router } from './router'
import { installStores } from './stores/install'
import { persistedSessionToken } from './stores/auth'
import { configureSink } from './analytics/index'
import { vercelSink } from './analytics/sinks'
import { bufferErrorReports, captureUncaughtErrors, reportVueErrors } from './errorReporting/index'

if (import.meta.env.PROD) {
  configureSink(vercelSink)
}

const app = createApp(App)

const faroUrl = import.meta.env.VITE_FARO_URL as string | undefined
const reportsErrors = import.meta.env.PROD && Boolean(faroUrl)
let releaseUncaughtErrors = () => {}
if (reportsErrors) {
  bufferErrorReports()
  releaseUncaughtErrors = captureUncaughtErrors(window)
  reportVueErrors(app)
}

installStores(app, { onSessionExpired: () => void redirectAfterSessionExpiry(router) })
app.use(router).mount('#app')

// The Faro SDK is most of what the entry chunk would otherwise carry, so it
// loads after first render rather than ahead of it (SPA-493). What fails in
// between is buffered above and handed over when it starts.
if (reportsErrors && faroUrl) {
  void import('./errorReporting/faro').then(({ startErrorReporting }) => {
    releaseUncaughtErrors()
    startErrorReporting(router, {
      collectorUrl: faroUrl,
      release: __BUILD_VERSION__,
      sessionToken: persistedSessionToken,
    })
  })
}
