import { createRouter, createWebHistory } from 'vue-router'
import CoverPage from '../views/CoverPage.vue'
import ScenarioView from '../views/ScenarioView.vue'
import LoginView from '../views/LoginView.vue'
import AuthoringView from '../views/AuthoringView.vue'
import ServiceAuthoringView from '../views/ServiceAuthoringView.vue'
import RouteView from '../views/RouteView.vue'
import NotFoundView from '../views/NotFoundView.vue'
import { trackPageView } from '../analytics/index'
import { useAuthStore } from '../stores/auth'

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
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/authoring',
      name: 'authoring',
      component: AuthoringView,
      meta: { requiresAuth: true },
    },
    {
      path: '/authoring/services/new',
      name: 'new-service',
      component: ServiceAuthoringView,
      meta: { requiresAuth: true },
    },
    {
      path: '/routes/:slug',
      name: 'route',
      component: RouteView,
      props: true,
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
    },
  ],
})

// Invite-only auth: gate authoring routes behind sign-in, and keep a
// signed-in user off the login page rather than showing it pointlessly.
router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { path: '/authoring' }
  }
})

router.afterEach((to) => {
  trackPageView(to.path)
})
