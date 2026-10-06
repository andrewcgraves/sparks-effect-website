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

function parse(html: string | null): Document {
  return new DOMParser().parseFromString(html ?? '', 'text/html')
}

function meta(doc: Document, key: string): string | null {
  const el = doc.querySelector(`meta[property="${key}"], meta[name="${key}"]`)
  return el?.getAttribute('content') ?? null
}

function canonical(doc: Document): string | null {
  return doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? null
}

describe('renderPreview', () => {
  it('describes the cover page with the site name and an absolute URL on the requesting host', async () => {
    const html = await renderPreview(new URL('https://staging.example.app/'), Promise.resolve(SHELL), () => {
      throw new Error('the cover page reads nothing')
    })

    const doc = parse(html)
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
    const html = await renderPreview(new URL('https://www.example.app/services/northbound-express?at=1,2'), Promise.resolve(SHELL), async (path) => {
      reads.push(path)
      return { name: 'Northbound Express', subtext: 'Rail · 12 stops', description: 'A fast line up the coast.' }
    })

    const doc = parse(html)
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
    const notFound = await renderPreview(url, Promise.resolve(SHELL), () => Promise.reject(new Error('404')))
    const timedOut = await renderPreview(url, Promise.resolve(SHELL), () => Promise.reject(new DOMException('timed out', 'TimeoutError')))
    const malformed = await renderPreview(url, Promise.resolve(SHELL), async () => ({ name: 42 }))

    const doc = parse(notFound)
    expect(doc.title).toBe('Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/services/draft-line')
    expect(timedOut).toBe(notFound)
    expect(malformed).toBe(notFound)
  })

  it('writes author text literally, never as markup', async () => {
    const hostile = `"><script>alert(1)</script>`
    const html = await renderPreview(new URL('https://www.example.app/services/x'), Promise.resolve(SHELL), async () => ({
      name: hostile,
      description: `It's <b>fast</b> & "new"`,
    }))

    const doc = parse(html)
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
    const html = await renderPreview(new URL('https://www.example.app/services/x'), Promise.resolve(SHELL), async () => ({
      name: 'Long Line',
      description,
    }))

    const cut = meta(parse(html), 'og:description')!
    expect(cut).toBe(`${'The quick brown fox jumps over the lazy dog. '.repeat(4)}The quick brown fox…`)
    expect(cut.length).toBeLessThanOrEqual(201)
  })

  it('leaves a description of 200 characters or fewer whole', async () => {
    const description = 'x'.repeat(200)
    const html = await renderPreview(new URL('https://www.example.app/services/x'), Promise.resolve(SHELL), async () => ({
      name: 'Short Line',
      description,
    }))
    expect(meta(parse(html), 'og:description')).toBe(description)
  })

  it('describes a curated scenario by its name and description', async () => {
    const reads: string[] = []
    const html = await renderPreview(new URL('https://www.example.app/scenario/ca-hsr'), Promise.resolve(SHELL), async (path) => {
      reads.push(path)
      return { name: 'California HSR', description: 'San Francisco to Los Angeles in under three hours.' }
    })

    const doc = parse(html)
    expect(reads).toEqual(['/api/scenarios/ca-hsr'])
    expect(doc.title).toBe('California HSR · Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('California HSR')
    expect(meta(doc, 'og:description')).toBe('San Francisco to Los Angeles in under three hours.')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/scenario/ca-hsr')
  })

  it('describes a curated route by its name', async () => {
    const reads: string[] = []
    const html = await renderPreview(new URL('https://www.example.app/routes/main-line'), Promise.resolve(SHELL), async (path) => {
      reads.push(path)
      return { name: 'Main Line', mode: 'rail' }
    })

    const doc = parse(html)
    expect(reads).toEqual(['/api/routes/main-line'])
    expect(doc.title).toBe('Main Line · Sparks Effect')
    expect(meta(doc, 'og:title')).toBe('Main Line')
    expect(meta(doc, 'og:description')).toBe('A route on Sparks Effect that lines can run along.')
    expect(meta(doc, 'og:url')).toBe('https://www.example.app/routes/main-line')
  })

  it('reads nothing for a private page and gives it the site-wide card', async () => {
    const reads: string[] = []
    const read = async (path: string) => {
      reads.push(path)
      return { name: 'Secret Draft' }
    }
    for (const path of ['/authoring/services/secret-draft', '/authoring', '/login', '/services/a/b', '/services/%22x']) {
      const doc = parse(await renderPreview(new URL(`https://www.example.app${path}`), Promise.resolve(SHELL), read))
      expect(doc.title).toBe('Sparks Effect')
      expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    }
    expect(reads).toEqual([])
  })
})

describe('renderPreview canonical URL', () => {
  it('names the page once, on the requesting host, as og:url does', async () => {
    const doc = parse(await renderPreview(new URL('https://sparks-effect.app/scenario/ca-hsr'), Promise.resolve(SHELL), async () => ({
      name: 'California HSR',
    })))
    expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(canonical(doc)).toBe('https://sparks-effect.app/scenario/ca-hsr')
    expect(meta(doc, 'og:url')).toBe(canonical(doc))
  })

  it('names the host that asked, so a build promoted from staging names production', async () => {
    for (const origin of ['https://dev.sparks-effect.app', 'https://sparks-effect.app']) {
      const doc = parse(await renderPreview(new URL(`${origin}/`), Promise.resolve(SHELL), async () => ({})))
      expect(canonical(doc)).toBe(`${origin}/`)
    }
  })

  it('drops the query, the fragment and a trailing slash, so every way of reaching a page names it the same', async () => {
    const read = async () => ({ name: 'Northbound Express' })
    const urls = [
      'https://sparks-effect.app/services/northbound-express?origin=37.7,-122.4&budget=60',
      'https://sparks-effect.app/services/northbound-express/',
      'https://sparks-effect.app/services/northbound-express#map',
      'https://SPARKS-EFFECT.app:443/services/northbound-express',
    ]
    for (const url of urls) {
      const doc = parse(await renderPreview(new URL(url), Promise.resolve(SHELL), read))
      expect(canonical(doc), url).toBe('https://sparks-effect.app/services/northbound-express')
    }
  })

  it('keeps the cover page at the bare origin and a slash', async () => {
    const doc = parse(await renderPreview(new URL('https://sparks-effect.app/?at=1,2'), Promise.resolve(SHELL), async () => ({})))
    expect(canonical(doc)).toBe('https://sparks-effect.app/')
  })

  it('still names the page when its read fails, so an unpublished service reads like any unknown slug', async () => {
    const doc = parse(await renderPreview(new URL('https://sparks-effect.app/services/draft'), Promise.resolve(SHELL), () => Promise.reject(new Error('404'))))
    expect(canonical(doc)).toBe('https://sparks-effect.app/services/draft')
  })

  it('escapes the URL it writes into the attribute', async () => {
    const html = await renderPreview(new URL("https://sparks-effect.app/routes/a&b'c"), Promise.resolve(SHELL), async () => ({}))
    expect(html).toContain('<link rel="canonical" href="https://sparks-effect.app/routes/a&amp;b&#39;c" />')
    expect(canonical(parse(html))).toBe("https://sparks-effect.app/routes/a&b'c")
  })

  it('replaces a canonical the shell already carries rather than adding a second', async () => {
    const shell = SHELL.replace('</head>', '<link rel="canonical" href="https://elsewhere.example/" />\n  </head>')
    const doc = parse(await renderPreview(new URL('https://sparks-effect.app/'), Promise.resolve(shell), async () => ({})))
    expect(doc.querySelectorAll('link[rel="canonical"]')).toHaveLength(1)
    expect(canonical(doc)).toBe('https://sparks-effect.app/')
  })
})

describe('renderPreview without a shell', () => {
  it('answers null, leaving the page to be served as built', async () => {
    const html = await renderPreview(new URL('https://www.example.app/'), Promise.resolve(null), async () => ({}))
    expect(html).toBeNull()
  })

  it('reads the API while the shell is still on its way, not after', async () => {
    let arrive: (shell: string) => void = () => {}
    const shell = new Promise<string>((resolve) => { arrive = resolve })
    const html = await renderPreview(new URL('https://www.example.app/routes/main-line'), shell, async () => {
      arrive(SHELL)
      return { name: 'Main Line', mode: 'rail' }
    })
    expect(meta(parse(html!), 'og:title')).toBe('Main Line')
  })
})

describe('withDefaultPreview', () => {
  it('gives the built shell the site-wide card, with no URL baked in', () => {
    const doc = parse(withDefaultPreview(SHELL))
    expect(doc.title).toBe('Sparks Effect')
    expect(doc.querySelectorAll('title')).toHaveLength(1)
    expect(meta(doc, 'og:title')).toBe('Sparks Effect')
    expect(meta(doc, 'og:description')).toMatch(/splash zone/)
    expect(meta(doc, 'twitter:card')).toBe('summary')
    expect(meta(doc, 'og:url')).toBeNull()
    expect(canonical(doc)).toBeNull()
  })

  it('is replaced, not duplicated, when a page preview is spliced over it', async () => {
    const html = await renderPreview(new URL('https://www.example.app/routes/main-line'), Promise.resolve(withDefaultPreview(SHELL)), async () => ({
      name: 'Main Line',
      mode: 'rail',
    }))
    const doc = parse(html)
    expect(doc.querySelectorAll('title')).toHaveLength(1)
    expect(doc.querySelectorAll('meta[property="og:title"]')).toHaveLength(1)
    expect(doc.querySelectorAll('meta[name="description"]')).toHaveLength(1)
    expect(meta(doc, 'og:title')).toBe('Main Line')
  })
})
