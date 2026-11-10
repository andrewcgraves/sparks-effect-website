import type { LocationQuery } from 'vue-router'
import { readIsochroneQuery } from '../isochroneQuery'
import { escapeMarkup } from '../share/escape'

export type EmbedKind = 'scenario' | 'services'

export interface EmbedTarget {
  kind: EmbedKind
  slug: string
}

export function isEmbedPath(pathname: string): boolean {
  return pathname.startsWith('/embed/')
}

const PLOT_KEYS = ['at', 'mode', 'mins'] as const

// Copied as the link says them rather than re-read and re-written, so a link
// that named only an origin is passed on naming only an origin. Without an
// origin the rest is no plot at all.
function plotParams(query: LocationQuery): URLSearchParams {
  const params = new URLSearchParams()
  if (readIsochroneQuery(query).lat === undefined) return params
  for (const key of PLOT_KEYS) {
    const value = query[key]
    if (typeof value === 'string') params.set(key, value)
  }
  return params
}

function href(origin: string, path: string, params: URLSearchParams): string {
  const search = params.toString()
  return `${origin}${path}${search ? `?${search}` : ''}`
}

export function fullPageHref(origin: string, target: EmbedTarget, query: LocationQuery): string {
  return href(origin, `/${target.kind}/${target.slug}`, plotParams(query))
}

export interface EmbedSnippetOptions {
  origin: string
  target: EmbedTarget
  name: string
  query: LocationQuery
  controls: boolean
}

// The embed URL and its parameters are a public contract once pasted into
// someone's post: they are not renamed.
export function embedSnippet({ origin, target, name, query, controls }: EmbedSnippetOptions): string {
  const params = plotParams(query)
  if (controls) params.set('controls', '1')
  const src = href(origin, `/embed/${target.kind}/${target.slug}`, params)
  return (
    `<iframe src="${escapeMarkup(src)}"\n` +
    '  width="100%" height="480" loading="lazy" style="border:0"\n' +
    `  title="${escapeMarkup(`${name} splash zone on Sparks Effect`)}"></iframe>`
  )
}
