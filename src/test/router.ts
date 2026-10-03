import { createMemoryHistory, createRouter } from 'vue-router'

export function homeOnlyRouter() {
  return createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div />' } }] })
}
