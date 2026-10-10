import { createRouter, createWebHistory, START_LOCATION, type Router } from 'vue-router'
import CoverPage from '../views/CoverPage.vue'
import NotFoundView from '../views/NotFoundView.vue'
import { trackPageView } from '../analytics/index'
import { redactPath } from '../analytics/redact'
import { formatPageTitle } from '../share/pageTitle'
import { useAuthStore } from '../stores/auth'

declare module 'vue-router' {
  interface RouteMeta {
    requiresAuth?: boolean
    requiresAdmin?: boolean
    title?: string
  }
}

export const router = createRouter({
  history: createWebHistory(),
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) return savedPosition
    if (to.hash) return { el: to.hash }
    // A plot writes its query to the URL on the same path; jumping to the top
    // there would scroll the map away from under the visitor.
    if (to.path !== from.path) return { top: 0 }
    return false
  },
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
      meta: { title: 'Network' },
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
      component: () => import('../views/WelcomeView.vue'),
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
      path: '/account',
      name: 'account',
      component: () => import('../views/AccountView.vue'),
      meta: { requiresAuth: true, title: 'Account' },
    },
    {
      path: '/authoring/services/new',
      name: 'new-service',
      component: () => import('../views/ServiceAuthoringView.vue'),
      meta: { requiresAuth: true, title: 'New line' },
    },
    {
      path: '/authoring/scenarios/new',
      name: 'new-scenario',
      component: () => import('../views/ScenarioBuilderView.vue'),
      meta: { requiresAuth: true, title: 'New network' },
    },
    {
      path: '/authoring/services/:slug/edit',
      name: 'edit-service',
      component: () => import('../views/ServiceAuthoringView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'Edit line' },
    },
    {
      path: '/authoring/scenarios/:slug/edit',
      name: 'edit-scenario',
      component: () => import('../views/ScenarioBuilderView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'Edit network' },
    },
    {
      path: '/authoring/services/:slug',
      name: 'service-detail',
      component: () => import('../views/AuthoredServiceView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'My line' },
    },
    {
      path: '/authoring/scenarios/:slug',
      name: 'scenario-detail',
      component: () => import('../views/AuthoredScenarioView.vue'),
      props: true,
      meta: { requiresAuth: true, title: 'My network' },
    },
    {
      path: '/admin',
      name: 'admin',
      component: () => import('../views/AdminView.vue'),
      meta: { requiresAuth: true, requiresAdmin: true, title: 'Admin' },
    },
    // A publication, which anyone may read. The owner's draft stays behind
    // sign-in at /authoring/services/:slug (ADR-0005 in sparks-effect-api).
    {
      path: '/services/:slug',
      name: 'published-service',
      component: () => import('../views/PublishedServiceView.vue'),
      props: true,
      meta: { title: 'Line' },
    },
    {
      path: '/routes/:slug',
      name: 'route',
      component: () => import('../views/RouteView.vue'),
      props: true,
      meta: { title: 'Route' },
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: () => import('../views/PrivacyView.vue'),
      meta: { title: 'Privacy policy' },
    },
    {
      path: '/terms',
      name: 'terms',
      component: () => import('../views/TermsView.vue'),
      meta: { title: 'Terms of use' },
    },
    {
      path: '/attribution',
      name: 'attribution',
      component: () => import('../views/AttributionView.vue'),
      meta: { title: 'Attribution' },
    },
    {
      path: '/:pathMatch(.*)*',
      name: 'not-found',
      component: NotFoundView,
      meta: { title: 'Page not found' },
    },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath } }
  }

  // Only a convenience: the API refuses a non-admin on every admin endpoint.
  // After a reload the token is back before /api/auth/me has said whose it is,
  // so this waits for that rather than turning an admin away.
  if (to.meta.requiresAdmin) {
    if (!auth.user) await auth.restoreSession()
    if (!auth.user?.is_admin) return { path: '/' }
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
