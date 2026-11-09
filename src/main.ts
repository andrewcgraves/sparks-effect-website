import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { redirectAfterSessionExpiry, router } from './router'
import { installStores } from './stores/install'
import { isEmbedPath } from './embed/embedLinks'
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

// An embed is framed by other sites and never navigates out of /embed/ (its
// links open new tabs), so deciding once, here, holds for its whole life.
const anonymous = isEmbedPath(window.location.pathname)
installStores(app, {
  onSessionExpired: () => void redirectAfterSessionExpiry(router),
  anonymous,
})
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
        // An embed never reads the session, so it has none to scrub.
        sessionToken: anonymous ? () => null : persistedSessionToken,
      })
    })
    // With no tracker to hand them to (offline, a blocked or replaced chunk),
    // the buffer would only grow, so it is dropped.
    .catch(() => {
      releaseUncaughtErrors()
      configureErrorSink(() => {})
    })
}
