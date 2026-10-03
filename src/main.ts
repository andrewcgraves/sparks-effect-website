import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { redirectAfterSessionExpiry, router } from './router'
import { installStores } from './stores/install'
import { configureSink } from './analytics/index'
import { vercelSink } from './analytics/sinks'

if (import.meta.env.PROD) {
  configureSink(vercelSink)
}

const app = createApp(App)
installStores(app, { onSessionExpired: () => void redirectAfterSessionExpiry(router) })
app.use(router).mount('#app')
