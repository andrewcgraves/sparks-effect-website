import { createMemoryHistory, createRouter, type Router } from 'vue-router'

// A spec that mounts a page on its own still needs a router for the page's
// useRoute/useRouter. Every path resolves, so a spec can start anywhere.
export function testRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
  })
}

// A page reads its query as it is set up, so the router is already there,
// as it is for a pasted link.
export async function testRouterAt(path: string): Promise<Router> {
  const router = testRouter()
  await router.push(path)
  await router.isReady()
  return router
}
