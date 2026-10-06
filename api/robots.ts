// `.js`, not `.ts`, for the same reason as middleware.ts.
import { robotsTxt } from '../src/share/robots.js'

// Served at /robots.txt (vercel.json).
export function GET(request: Request): Response {
  return new Response(robotsTxt(new URL(request.url).origin), {
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, s-maxage=3600',
    },
  })
}

// Unexported methods answer 405, and crawlers and uptime checks send HEAD.
export const HEAD = GET
