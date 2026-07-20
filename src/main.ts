import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import { router } from './router'
import { installStores } from './stores'

const app = createApp(App)
installStores(app)
app.use(router).mount('#app')
