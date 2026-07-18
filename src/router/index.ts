import { createRouter, createWebHistory } from 'vue-router'
import CoverPage from '../views/CoverPage.vue'
import ScenarioView from '../views/ScenarioView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import { trackPageView } from '../analytics/index'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      name: 'cover',
      component: CoverPage,
    },
    {
      path: '/scenario/:slug',
      name: 'scenario',
      component: ScenarioView,
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
    },
  ],
})

router.afterEach((to) => {
  trackPageView(to.path)
})
