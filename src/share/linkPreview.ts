import { SITE_NAME, formatPageTitle } from './pageTitle.js'

export const SITE_DESCRIPTION =
  'Sparks Effect maps the "splash zone" reachable by walking, biking, transit, and driving from a hypothetical transit line.'

interface PageMeta {
  name: string | null
  description: string
  url?: string
}

const SITE_DEFAULT: PageMeta = { name: null, description: SITE_DESCRIPTION }

function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function metaTags(page: PageMeta): string {
  const title = formatPageTitle(page.name)
  const tags: [string, string, string][] = [
    ['name', 'description', page.description],
    ['property', 'og:type', 'website'],
    ['property', 'og:site_name', SITE_NAME],
    ['property', 'og:title', page.name ?? SITE_NAME],
    ['property', 'og:description', page.description],
  ]
  if (page.url) tags.push(['property', 'og:url', page.url])
  tags.push(['name', 'twitter:card', 'summary'])
  return [
    `<title>${escapeAttribute(title)}</title>`,
    ...tags.map(([attr, key, value]) => `<meta ${attr}="${key}" content="${escapeAttribute(value)}" />`),
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

function text(value: unknown): string | null {
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
  read: (slug: string) => string
  describe: (body: Record<string, unknown>) => string | null
}

// Keyed by the route's first path segment (src/router/index.ts). Each reads
// the public endpoint that names the page, so nothing an owner keeps private
// can reach this HTML: an owned route 404s to an anonymous read.
const PUBLIC_PAGES = new Map<string, PublicPage>([
  ['scenario', {
    read: (slug) => `/api/scenarios/${slug}`,
    describe: (body) => text(body.description),
  }],
  ['services', {
    read: (slug) => `/api/services/${slug}/publication`,
    describe: (body) => text(body.description),
  }],
  ['routes', {
    read: (slug) => `/api/routes/${slug}`,
    describe: (body) => {
      const mode = text(body.mode)
      return mode ? `A ${mode} route on Sparks Effect. See the splash zone reachable from it.` : null
    },
  }],
])

const PUBLIC_PATH = /^\/([a-z]+)\/([A-Za-z0-9_-]+)$/

async function pageMeta(pathname: string, read: ApiRead): Promise<PageMeta> {
  const match = pathname.match(PUBLIC_PATH)
  const page = match && PUBLIC_PAGES.get(match[1])
  if (!match || !page) return SITE_DEFAULT
  const body = (await read(page.read(match[2]))) as Record<string, unknown>
  const name = text(body.name)
  if (!name) return SITE_DEFAULT
  return { name, description: truncate(page.describe(body) ?? SITE_DESCRIPTION) }
}

export async function renderPreview(requestUrl: URL, shell: string, read: ApiRead): Promise<string> {
  // A failed read, whatever failed, is the same card an unknown slug gets: an
  // unpublished service must look exactly like one that never existed.
  const page = await pageMeta(requestUrl.pathname, read).catch(() => SITE_DEFAULT)
  return spliceHead(shell, metaTags({ ...page, url: `${requestUrl.origin}${requestUrl.pathname}` }))
}

// The build's own index.html: what every page the middleware does not answer
// for is served with. No og:url, since the build cannot know which host will
// serve it (docs/releases.md — production is a promotion, not a rebuild).
export function withDefaultPreview(html: string): string {
  return spliceHead(html, metaTags(SITE_DEFAULT))
}
