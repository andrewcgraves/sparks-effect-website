import { createRouter, createWebHistory, type Router } from 'vue-router'
import CoverPage from '../views/CoverPage.vue'
import NotFoundView from '../views/NotFoundView.vue'
import WelcomeView from '../views/WelcomeView.vue'
import { trackPageView } from '../analytics/index'
import { redactPath } from '../analytics/redact'
import { formatPageTitle } from '../composables/usePageTitle'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    title?: string
  }
}

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
      component: () => import('../views/ScenarioView.vue'),
      props: true,
      meta: { title: 'Scenario' },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { title: 'Sign in' },
    },
    // An invite or reset link. Open to a signed-in user too: the page itself
    // sends them away if the link is for someone else.
    {
      path: '/welcome/:token',
      name: 'welcome',
      component: WelcomeView,
      props: true,
      meta: { title: 'Set your password' },
    },
    // The form of link sparks-effect-api issues (SPA-387).
    {
      path: '/set-password',
      redirect: (to) => {
        const token = to.query.token
        return typeof token === 'string' && token
          ? { name: 'welcome', params: { token }, query: {} }
          : { path: '/login', query: {} }
      },
    },
    {
      path: '/authoring',
      name: 'authoring',
      component: () => import('../views/AuthoringView.vue'),
      meta: { requiresAuth: true, title: 'My authoring' },
    },
    {
      path: '/authoring/services/new',
      name: 'new-service',
      component: () => import('../views/ServiceAuthoringView.vue'),
      meta: { requiresAuth: true, title: 'New service' },
    },
    {
      path: '/authoring/scenarios/new',
      name: 'new-scenario',
      component: () => import('../views/ScenarioBuilderView.vue'),
      meta: { requiresAuth: true, title: 'New scenario' },
    },
    {
      path: '/authoring/services/:slug/edit',
      name: 'edit-service',
      component: () => import('../views/ServiceAuthoringView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'Edit service' },
    },
    {
      path: '/authoring/scenarios/:slug/edit',
      name: 'edit-scenario',
      component: () => import('../views/ScenarioBuilderView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'Edit scenario' },
    },
    {
      path: '/authoring/services/:slug',
      name: 'service-detail',
      component: () => import('../views/AuthoredServiceView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'My service' },
    },
    {
      path: '/authoring/scenarios/:slug',
      name: 'scenario-detail',
      component: () => import('../views/AuthoredScenarioView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'My scenario' },
    },
    // A publication, which anyone may read. The owner's draft stays behind
    // sign-in at /authoring/services/:slug (ADR-0005 in sparks-effect-api).
    {
      path: '/services/:slug',
      name: 'published-service',
      component: () => import('../views/PublishedServiceView.vue'),
      props: true,
      meta: { title: 'Service' },
    },
    {
      path: '/routes/:slug',
      name: 'route',
      component: () => import('../views/RouteView.vue'),
      props: true,
      meta: { title: 'Route' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { title: 'Page not found' },
    },
  ],
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  if (to.name === 'login' && auth.isAuthenticated) {
    return { path: '/authoring' }
  }
})

// Sends the user to sign in after their session expired under them, bringing
// them back to the page they were on once they have. Only a page that needs a
// session is left: a public page still works signed out, so a visitor there
// just sees the header switch to "Sign in".
export async function redirectAfterSessionExpiry(target: Router): Promise<void> {
  const current = target.currentRoute.value
  if (!current.meta.requiresAuth) return
  await target.push({ path: '/login', query: { redirect: current.fullPath } })
}

router.afterEach((to) => {
  document.title = formatPageTitle(to.meta.title)
  trackPageView(redactPath(to.path))
})
