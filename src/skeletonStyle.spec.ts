/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const styleCss = readFileSync(resolve(process.cwd(), 'src/style.css'), 'utf8')

function rulesFor(selector: string, css: string): string[] {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return [...css.matchAll(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, 'g'))].map((match) => match[1])
}

function reducedMotionBlocks(css: string): string {
  const start = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g
  let blocks = ''
  for (const match of css.matchAll(start)) {
    let depth = 1
    let index = match.index + match[0].length
    const bodyStart = index
    while (depth > 0 && index < css.length) {
      if (css[index] === '{') depth++
      if (css[index] === '}') depth--
      index++
    }
    blocks += css.slice(bodyStart, index - 1)
  }
  return blocks
}

describe('skeleton style', () => {
  it('fills skeletons with the placeholder token', () => {
    expect(rulesFor('.skeleton', styleCss).join('')).toContain('var(--color-placeholder)')
  })

  it('shimmers', () => {
    expect(rulesFor('.skeleton', styleCss).join('')).toMatch(/animation:\s*skeleton-shimmer/)
  })

  it('holds still for readers who prefer reduced motion', () => {
    expect(rulesFor('.skeleton', reducedMotionBlocks(styleCss)).join('')).toMatch(/animation:\s*none/)
  })
})
