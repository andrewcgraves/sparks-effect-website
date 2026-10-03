/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { shortCommitSha } from './src/buildVersion.ts'

function httpOrigin(raw: string | undefined): string | null {
  const trimmed = raw?.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    // A preconnect is an origin: a path on the API base is not part of it, and
    // a relative or non-http value has nothing to connect to ahead of time.
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    return url.origin
  } catch {
    return null
  }
}

function apiOriginPreconnect(apiBaseUrl: string | undefined): Plugin {
  const origin = httpOrigin(apiBaseUrl)
  return {
    name: 'api-origin-preconnect',
    transformIndexHtml(html) {
      if (!origin) return html
      const tile = '<link rel="preconnect" href="https://tiles.openfreemap.org" crossorigin />'
      const api = `<link rel="preconnect" href="${origin}" crossorigin />`
      return html.replace(tile, `${tile}\n    ${api}`)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL
  return {
    plugins: [vue(), tailwindcss(), apiOriginPreconnect(apiBaseUrl)],
    define: {
      // Vercel sets the commit SHA at build time; local builds show "dev".
      __BUILD_VERSION__: JSON.stringify(shortCommitSha(process.env.VERCEL_GIT_COMMIT_SHA)),
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.spec.ts'],
      setupFiles: ['src/test/setup.ts'],
    },
  }
})
