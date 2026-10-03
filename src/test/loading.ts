import type { BaseWrapper } from '@vue/test-utils'

export function visibleText(wrapper: { element: Node }): string {
  const clone = wrapper.element.cloneNode(true) as Element
  clone.querySelectorAll('.sr-only').forEach((node) => node.remove())
  return clone.textContent ?? ''
}

export function busyRegion(wrapper: Pick<BaseWrapper<Node>, 'get'>, testId: string) {
  return wrapper.get(`[data-testid="${testId}"][aria-busy="true"]`)
}
