import { describe, expect, it } from 'vitest'
import { renderPreview, withDefaultPreview } from './linkPreview'

const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Sparks Effect</title>
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
  </head>
  <body><div id="app"></div></body>
</html>`

function head(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html')
}

function meta(doc: Document, key: string): string | null {
  const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
  return el?.getAttribute('content') ?? null
}

describe('renderPreview', () => {
  it('describes the cover page with the site name and an absolute URL on the requesting host', async () => {
    const html = await renderPreview(new URL('https://staging.example.app/'), SHELL, () => {
      throw new Error('the cover page reads nothing')
    })

    const doc = head(html)
    expect(doc.title).toBe('Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    expect(meta(doc, 'og:site_name')).toBe('Sparks Effect')
    expect(meta(doc, 'og:type')).toBe('website')
    expect(meta(doc, 'og:url')).toBe('https://staging.example.app/')
    expect(meta(doc, 'twitter:card')).toBe('summary')
    expect(meta(doc, 'og:description')).toMatch(/splash zone/)
    expect(meta(doc, 'description')).toBe(meta(doc, 'og:description'))
    expect(doc.querySelectorAll('title')).toHaveLength(1)
    expect(doc.querySelector('meta[property="og:image"]')).toBeNull()
    expect(html).toContain('src="/assets/index-abc123.js"')
  })

  it('describes a published service by its own name and description', async () => {
    const reads: string[] = []
    const html = await renderPreview(new URL('https://www.example.app/services/northbound-express?at=1,2'), SHELL, async (path) => {
      reads.push(path)
      return { name: 'Northbound Express', subtext: 'Rail · 12 stops', description: 'A fast line up the coast.' }
    })

    const doc = head(html)
    expect(reads).toEqual(['/api/services/northbound-express/publication'])
    expect(doc.title).toBe('Northbound Express · Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('Northbound Express')
    expect(meta(doc, 'og:description')).toBe('A fast line up the coast.')
    expect(meta(doc, 'description')).toBe('A fast line up the coast.')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/services/northbound-express')
    expect(meta(doc, 'twitter:card')).toBe('summary')
  })

  it('gives a service whose read fails the site-wide card, whatever the failure', async () => {
    const url = new URL('https://www.example.app/services/draft-line')
    const notFound = await renderPreview(url, SHELL, () => Promise.reject(new Error('404')))
    const timedOut = await renderPreview(url, SHELL, () => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    const malformed = await renderPreview(url, SHELL, async () => ({ name: 42 }))

    const doc = head(notFound)
    expect(doc.title).toBe('Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/services/draft-line')
    expect(timedOut).toBe(notFound)
    expect(malformed).toBe(notFound)
  })

  it('writes author text literally, never as markup', async () => {
    const hostile = `"><script>alert(1)</script>`
    const html = await renderPreview(new URL('https://www.example.app/services/x'), SHELL, async () => ({
      name: hostile,
      description: `It's <b>fast</b> & "new"`,
    }))

    const doc = head(html)
    expect(doc.querySelectorAll('script')).toHaveLength(1)
    expect(doc.title).toBe(`${hostile} · Sparks Effect`)
    expect(meta(doc, 'og:title')).toBe(hostile)
    expect(meta(doc, 'og:description')).toBe(`It's <b>fast</b> & "new"`)
    expect(html).not.toContain('<script>alert(1)')
    expect(html).toContain('&quot;&gt;&lt;script&gt;')
    expect(html).toContain('It&#39;s &lt;b&gt;fast&lt;/b&gt; &amp; &quot;new&quot;')
  })

  it('cuts a long description at a word boundary near 200 characters', async () => {
    // Four 45-character sentences, then a fifth that crosses 200 mid-"jumps".
    const description = 'The quick brown fox jumps over the lazy dog. '.repeat(5)
    const html = await renderPreview(new URL('https://www.example.app/services/x'), SHELL, async () => ({
      name: 'Long Line',
      description,
    }))

    const cut = meta(head(html), 'og:description')!
    expect(cut).toBe(`${'The quick brown fox jumps over the lazy dog. '.repeat(4)}The quick brown fox…`)
    expect(cut.length).toBeLessThanOrEqual(201)
  })

  it('leaves a description of 200 characters or fewer whole', async () => {
    const description = 'x'.repeat(200)
    const html = await renderPreview(new URL('https://www.example.app/services/x'), SHELL, async () => ({
      name: 'Short Line',
      description,
    }))
    expect(meta(head(html), 'og:description')).toBe(description)
  })

  it('describes a curated scenario by its name and description', async () => {
    const reads: string[] = []
    const html = await renderPreview(new URL('https://www.example.app/scenario/ca-hsr'), SHELL, async (path) => {
      reads.push(path)
      return { name: 'California HSR', description: 'San Francisco to Los Angeles in under three hours.' }
    })

    const doc = head(html)
    expect(reads).toEqual(['/api/scenarios/ca-hsr'])
    expect(doc.title).toBe('California HSR · Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('California HSR')
    expect(meta(doc, 'og:description')).toBe('San Francisco to Los Angeles in under three hours.')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/scenario/ca-hsr')
  })

  it('describes a curated route by its name and mode', async () => {
    const reads: string[] = []
    const html = await renderPreview(new URL('https://www.example.app/routes/main-line'), SHELL, async (path) => {
      reads.push(path)
      return { name: 'Main Line', mode: 'rail' }
    })

    const doc = head(html)
    expect(reads).toEqual(['/api/routes/main-line'])
    expect(doc.title).toBe('Main Line · Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('Main Line')
    expect(meta(doc, 'og:description')).toBe('A rail route on Sparks Effect. See the splash zone reachable from it.')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/routes/main-line')
  })

  it('reads nothing for a private page and gives it the site-wide card', async () => {
    const reads: string[] = []
    const read = async (path: string) => {
      reads.push(path)
      return { name: 'Secret Draft' }
    }
    for (const path of ['/authoring/services/secret-draft', '/authoring', '/login', '/services/a/b', '/services/%22x']) {
      const doc = head(await renderPreview(new URL(`https://www.example.app${path}`), SHELL, read))
      expect(doc.title).toBe('Sparks Effect')
      expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    }
    expect(reads).toEqual([])
  })
})

describe('withDefaultPreview', () => {
  it('gives the built shell the site-wide card, with no URL baked in', () => {
    const doc = head(withDefaultPreview(SHELL))
    expect(doc.title).toBe('Sparks Effect')
    expect(doc.querySelectorAll('title')).toHaveLength(1)
    expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    expect(meta(doc, 'og:description')).toMatch(/splash zone/)
    expect(meta(doc, 'twitter:card')).toBe('summary')
    expect(meta(doc, 'og:url')).toBeNull()
  })

  it('is replaced, not duplicated, when a page preview is spliced over it', async () => {
    const html = await renderPreview(new URL('https://www.example.app/routes/main-line'), withDefaultPreview(SHELL), async () => ({
      name: 'Main Line',
      mode: 'rail',
    }))
    const doc = head(html)
    expect(doc.querySelectorAll('title')).toHaveLength(1)
    expect(doc.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(doc.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(meta(doc, 'og:title')).toBe('Main Line')
  })
})
