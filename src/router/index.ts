import { createRouter, createWebHistory } from 'vue-router'
import { DEFAULT_SCENARIO_SLUG } from '../constants'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', redirect: `/service/${DEFAULT_SCENARIO_SLUG}` },
    {
      path: '/service/:slug',
      name: 'service',
      component: () => import('../views/ServiceView.vue'),
      props: true,
    },
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

export default router
