import { createRouter, createWebHistory, START_LOCATION, type Router } from 'vue-router'
import CoverPage from '../views/CoverPage.vue'
import ScenarioView from '../views/ScenarioView.vue'
import LoginView from '../views/LoginView.vue'
import AuthoringView from '../views/AuthoringView.vue'
import AccountView from '../views/AccountView.vue'
import ServiceAuthoringView from '../views/ServiceAuthoringView.vue'
import ScenarioBuilderView from '../views/ScenarioBuilderView.vue'
import AuthoredServiceView from '../views/AuthoredServiceView.vue'
import AuthoredScenarioView from '../views/AuthoredScenarioView.vue'
import RouteView from '../views/RouteView.vue'
import PublishedServiceView from '../views/PublishedServiceView.vue'
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
      component: ScenarioView,
      props: true,
      meta: { title: 'Scenario' },
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
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
      component: AuthoringView,
      meta: { requiresAuth: true, title: 'My authoring' },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { requiresAuth: true, title: 'Account' },
    },
    {
      path: '/authoring/services/new',
      name: 'new-service',
      component: ServiceAuthoringView,
      meta: { requiresAuth: true, title: 'New service' },
    },
    {
      path: '/authoring/scenarios/new',
      name: 'new-scenario',
      component: ScenarioBuilderView,
      meta: { requiresAuth: true, title: 'New scenario' },
    },
    {
      path: '/authoring/services/:slug/edit',
      name: 'edit-service',
      component: ServiceAuthoringView,
      props: true,
      meta: { requiresAuth: true, title: 'Edit service' },
    },
    {
      path: '/authoring/scenarios/:slug/edit',
      name: 'edit-scenario',
      component: ScenarioBuilderView,
      props: true,
      meta: { requiresAuth: true, title: 'Edit scenario' },
    },
    {
      path: '/authoring/services/:slug',
      name: 'service-detail',
      component: AuthoredServiceView,
      props: true,
      meta: { requiresAuth: true, title: 'My service' },
    },
    {
      path: '/authoring/scenarios/:slug',
      name: 'scenario-detail',
      component: AuthoredScenarioView,
      props: true,
      meta: { requiresAuth: true, title: 'My scenario' },
    },
    // A publication, which anyone may read. The owner's draft stays behind
    // sign-in at /authoring/services/:slug (ADR-0005 in sparks-effect-api).
    {
      path: '/services/:slug',
      name: 'published-service',
      component: PublishedServiceView,
      props: true,
      meta: { title: 'Service' },
    },
    {
      path: '/routes/:slug',
      name: 'route',
      component: RouteView,
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

router.afterEach((to, from) => {
  // A query change on the same page — a plotted isochrone written to the URL —
  // is not a new page: it would reset the title the page named itself, and
  // count a page view per plot. The first navigation's `from` is also '/'.
  if (from !== START_LOCATION && to.path === from.path) return
  document.title = formatPageTitle(to.meta.title)
  trackPageView(redactPath(to.path))
})
