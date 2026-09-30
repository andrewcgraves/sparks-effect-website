import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { installStores } from './stores'
import { configureSink } from './analytics/index'
import { vercelSink } from './analytics/sinks'

if (import.meta.env.PROD) {
  configureSink(vercelSink)
}

const app = createApp(App)
installStores(app)
app.use(router).mount('#app')
