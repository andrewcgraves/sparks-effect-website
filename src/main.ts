import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { redirectAfterSessionExpiry, router } from './router'
import { installStores } from './stores/install'
import { persistedSessionToken } from './stores/auth'
import { configureSink } from './analytics/index'
import { vercelSink } from './analytics/sinks'
import { startErrorReporting } from './errorReporting/faro'

if (import.meta.env.PROD) {
  configureSink(vercelSink)
}

const app = createApp(App)

const faroUrl = import.meta.env.VITE_FARO_URL as string | undefined
if (import.meta.env.PROD && faroUrl) {
  startErrorReporting(app, router, {
    collectorUrl: faroUrl,
    release: __BUILD_VERSION__,
    sessionToken: persistedSessionToken,
  })
}

installStores(app, { onSessionExpired: () => void redirectAfterSessionExpiry(router) })
app.use(router).mount('#app')
