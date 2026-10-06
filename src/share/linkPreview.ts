import { SITE_NAME, formatPageTitle } from './pageTitle.js'

const SITE_DESCRIPTION =
  'Sparks Effect maps the "splash zone" reachable by walking, biking, transit, and driving from a hypothetical transit line.'

interface PageMeta {
  name: string | null
  description: string
  url?: string
}

const SITE_DEFAULT: PageMeta = { name: null, description: SITE_DESCRIPTION }

// Safe both inside an attribute value and as the <title> element's text.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface MetaTag {
  attr: 'name' | 'property'
  key: string
  content: string
}

function metaTags(page: PageMeta): string {
  const tags: MetaTag[] = [
    { attr: 'name', key: 'description', content: page.description },
    { attr: 'property', key: 'og:type', content: 'website' },
    { attr: 'property', key: 'og:site_name', content: SITE_NAME },
    { attr: 'property', key: 'og:title', content: page.name ?? SITE_NAME },
    { attr: 'property', key: 'og:description', content: page.description },
  ]
  if (page.url) tags.push({ attr: 'property', key: 'og:url', content: page.url })
  tags.push({ attr: 'name', key: 'twitter:card', content: 'summary' })
  return [
    `<title>${escapeHtml(formatPageTitle(page.name))}</title>`,
    ...tags.map(({ attr, key, content }) => `<meta ${attr}="${key}" content="${escapeHtml(content)}" />`),
  ].join('\n    ')
}

// Whatever preview the shell already carries — the build's defaults — goes, so
// a page never ends up with two og:titles for a crawler to choose between.
const PREVIEW_TAG = /\s*(<title>[\s\S]*?<\/title>|<meta\s+(?:name="(?:description|twitter:[^"]*)"|property="og:[^"]*")[^>]*>)/g

function spliceHead(shell: string, tags: string): string {
  return shell.replace(PREVIEW_TAG, '').replace('</head>', `  ${tags}\n  </head>`)
}

export type ApiRead = (path: string) => Promise<unknown>

const DESCRIPTION_MAX = 200

function nonEmptyText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat || null
}

function truncate(value: string): string {
  if (value.length <= DESCRIPTION_MAX) return value
  const head = value.slice(0, DESCRIPTION_MAX + 1)
  const space = head.lastIndexOf(' ')
  const cut = space > 0 ? head.slice(0, space) : value.slice(0, DESCRIPTION_MAX)
  return `${cut.replace(/[\s.,;:!?—–-]+$/, '')}…`
}

interface PublicPage {
  endpoint: (slug: string) => string
  describe: (body: Record<string, unknown>) => string | null
}

// Keyed by the route's first path segment (src/router/index.ts; middleware.ts
// matches the same pages). Each reads the public endpoint that names the page,
// so nothing an owner keeps private can reach this HTML: an owned route 404s
// to an anonymous read.
const PUBLIC_PAGES = new Map<string, PublicPage>([
  ['scenario', {
    endpoint: (slug) => `/api/scenarios/${slug}`,
    describe: (body) => nonEmptyText(body.description),
  }],
  ['services', {
    endpoint: (slug) => `/api/services/${slug}/publication`,
    describe: (body) => nonEmptyText(body.description),
  }],
  ['routes', {
    endpoint: (slug) => `/api/routes/${slug}`,
    describe: () => `A route on ${SITE_NAME} that lines can run along.`,
  }],
])

// Each name must equal its route's meta.title (src/router/index.ts); the
// router spec holds them together.
export const STATIC_PAGES: ReadonlyMap<string, PageMeta> = new Map<string, PageMeta>([
  ['/how-it-works', {
    name: 'How it works',
    description:
      'What a splash zone assumes: door-to-door minutes with the wait for local transit included, an 8 a.m. weekday start for transit, and where the travel times come from.',
  }],
])

const PUBLIC_PATH = /^\/([a-z]+)\/([A-Za-z0-9_-]+)$/

async function readPageMeta(pathname: string, read: ApiRead): Promise<PageMeta> {
  const fixed = STATIC_PAGES.get(pathname)
  if (fixed) return fixed
  const match = pathname.match(PUBLIC_PATH)
  const page = match && PUBLIC_PAGES.get(match[1])
  if (!match || !page) return SITE_DEFAULT
  const body = (await read(page.endpoint(match[2]))) as Record<string, unknown>
  const name = nonEmptyText(body.name)
  if (!name) return SITE_DEFAULT
  return { name, description: truncate(page.describe(body) ?? SITE_DESCRIPTION) }
}

// Null when there is no shell to splice into. The shell arrives as a promise so
// its fetch and the API read overlap: neither waits on the other's timeout.
export async function renderPreview(
  requestUrl: URL,
  shell: Promise<string | null>,
  read: ApiRead,
): Promise<string | null> {
  // A failed read, whatever failed, is the same card an unknown slug gets: an
  // unpublished service must look exactly like one that never existed.
  const [html, page] = await Promise.all([
    shell,
    readPageMeta(requestUrl.pathname, read).catch(() => SITE_DEFAULT),
  ])
  if (html === null) return null
  return spliceHead(html, metaTags({ ...page, url: `${requestUrl.origin}${requestUrl.pathname}` }))
}

// The build's own index.html: what every page the middleware does not answer
// for is served with. No og:url, since the build cannot know which host will
// serve it (docs/releases.md — production is a promotion, not a rebuild).
export function withDefaultPreview(html: string): string {
  return spliceHead(html, metaTags(SITE_DEFAULT))
}
