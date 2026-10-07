import axe from 'axe-core'
import type { VueWrapper } from '@vue/test-utils'

// Colour contrast has its own ticket, and happy-dom has no canvas for axe to
// sample colours with, so it would only ever report "incomplete".
const RULES_OFF = { 'color-contrast': { enabled: false } }

export interface A11yViolation {
  rule: string
  impact: string
  targets: string[]
}

// Serious and critical only: the bar the website holds every view to. Each
// violation names its rule and the elements it fired on, so a failing
// toEqual([]) reads as a to-do list.
export async function seriousA11yViolations(root: Element | VueWrapper): Promise<A11yViolation[]> {
  const element = 'element' in root ? (root.element as Element) : root
  if (!element.isConnected) {
    throw new Error('axe needs the tree in the document: mount with attachTo: document.body')
  }
  const results = await axe.run(element, { rules: RULES_OFF, resultTypes: ['violations'] })
  return results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact as string,
      targets: v.nodes.map((n) => n.html.slice(0, 160)),
    }))
}
