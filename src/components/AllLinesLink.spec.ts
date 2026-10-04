import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter, type RouteRecordRaw } from 'vue-router'
import AllLinesLink from './AllLinesLink.vue'

const Blank = { template: '<div />' }

function mountLink(routes: RouteRecordRaw[] = []) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'cover', component: Blank }, ...routes],
  })
  return mount(AllLinesLink, { global: { plugins: [router] } })
}

describe('AllLinesLink', () => {
  it('reads as a way back to all lines', () => {
    expect(mountLink().get('a').text()).toBe('← All lines')
  })

  it('leads home while there is no Explore page', () => {
    expect(mountLink().get('a').attributes('href')).toBe('/')
  })

  it('leads to Explore once that page exists', () => {
    const wrapper = mountLink([{ path: '/explore', name: 'explore', component: Blank }])
    expect(wrapper.get('a').attributes('href')).toBe('/explore')
  })
})
