/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const VIEWS = resolve(process.cwd(), 'src', 'views')

const prosePages = readdirSync(VIEWS)
  .filter((name) => name.endsWith('.vue'))
  .map((name) => ({ name, text: readFileSync(resolve(VIEWS, name), 'utf8') }))
  .filter(({ text }) => text.includes('<ProsePage'))

describe('prose pages', () => {
  it('finds the real prose pages rather than silently matching nothing', () => {
    expect(prosePages.map(({ name }) => name)).toEqual(
      expect.arrayContaining(['AboutView.vue', 'HowItWorksView.vue', 'PrivacyView.vue']),
    )
  })

  // Every prose page opens with the lead and continues in body text, so two
  // pages read alike side by side.
  it.each(prosePages.map(({ name, text }) => [name, text]))('%s opens with the lead paragraph', (_, text) => {
    const afterHeader = text.slice(text.indexOf('<ProsePage'))
    const firstParagraph = afterHeader.match(/<p\b[^>]*>/)?.[0]
    expect(firstParagraph).toContain(':class="PROSE_LEAD_CLASS"')
  })
})
