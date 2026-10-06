// Every private page in src/router/index.ts sits under one of these prefixes.
// /set-password is the form of /welcome link the API issues (SPA-387), and
// carries the same one-time token.
export const DISALLOWED_PATHS = ['/authoring', '/login', '/account', '/admin', '/welcome', '/set-password']

// The Sitemap line has to be absolute, which is why this is served per request
// (api/robots.ts) rather than as a static file: the build cannot know which
// host will serve it, and production is a promotion of the staging build
// (docs/releases.md). The rules are the same on every host; staging and
// previews are kept out of the index by X-Robots-Tag (vercel.json), which a
// crawler only sees if robots.txt lets it fetch the page.
export function robotsTxt(origin: string): string {
  return [
    'User-agent: *',
    'Allow: /',
    ...DISALLOWED_PATHS.map((path) => `Disallow: ${path}`),
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n')
}
