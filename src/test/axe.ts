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
  const violations = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map((v) => ({
      rule: v.id,
      impact: v.impact as string,
      targets: v.nodes.map((n) => n.html.slice(0, 160)),
    }))
  const glyphs = glyphNamedControls(element)
  if (glyphs.length > 0) violations.push({ rule: 'glyph-name', impact: 'serious', targets: glyphs })
  return violations
}

// axe counts "✕" as a name, but a screen reader reads it as "multiplication
// sign", which is how this ticket's ↑ ↓ ✕ buttons started. A name with no
// letter or digit in it is no name at all. An empty name is axe's to report.
function glyphNamedControls(root: Element): string[] {
  return Array.from(root.querySelectorAll('button, a[href], [role="button"]'))
    .filter((control) => {
      const name = accessibleName(control)
      return name !== '' && !/[\p{L}\p{N}]/u.test(name)
    })
    .map((control) => control.outerHTML.slice(0, 160))
}

function accessibleName(control: Element): string {
  const labelledBy = control.getAttribute('aria-labelledby')
  if (labelledBy) {
    return labelledBy.split(/\s+/).map((id) => control.ownerDocument.getElementById(id)?.textContent ?? '').join(' ').trim()
  }
  const label = control.getAttribute('aria-label')
  if (label) return label.trim()
  const visible = control.cloneNode(true) as Element
  visible.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove())
  return (visible.textContent ?? '').trim()
}
