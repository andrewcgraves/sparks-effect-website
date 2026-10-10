/// <reference types="vitest/config" />
import { readdirSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import faroUploader from '@grafana/faro-rollup-plugin'
import { shortCommitSha } from './src/buildVersion.ts'
import { resolveTilePreconnectOrigin } from './src/tileHost.ts'
import { safeHttpOrigin } from './src/preconnect.ts'
import { FARO_APP_NAME } from './src/errorReporting/appName.ts'
import { withDefaultPreview } from './src/share/linkPreview.ts'
import { apiOriginMissingFromCsp, railTilesOriginMissingFromCsp, type VercelHeaderRule } from './src/securityHeaders.ts'

function preconnectTags(apiBaseUrl: string | undefined, stadiaApiKey: string | undefined): HtmlTagDescriptor[] {
  const tags: HtmlTagDescriptor[] = [
    {
      tag: 'link',
      attrs: {
        rel: 'preconnect',
        href: resolveTilePreconnectOrigin(stadiaApiKey),
        crossorigin: true,
      },
      injectTo: 'head',
    },
  ]
  const apiOrigin = safeHttpOrigin(apiBaseUrl)
  if (apiOrigin) {
    tags.push({
      tag: 'link',
      attrs: { rel: 'preconnect', href: apiOrigin, crossorigin: true },
      injectTo: 'head',
    })
  }
  return tags
}

function preconnectPlugin(apiBaseUrl: string | undefined, stadiaApiKey: string | undefined): Plugin {
  const tags = preconnectTags(apiBaseUrl, stadiaApiKey)
  return {
    name: 'preconnect',
    transformIndexHtml() {
      return tags
    },
  }
}

// The uploader deletes what it sent, but keeps every map when the upload fails
// (a bad key, Grafana down), and Vercel would then serve them. closeBundle runs
// after every plugin's writeBundle, the uploader's included.
function deleteSourceMaps(): Plugin {
  let outDir = 'dist'
  return {
    name: 'delete-source-maps',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir
    },
    closeBundle() {
      for (const file of readdirSync(outDir, { recursive: true, encoding: 'utf8' })) {
        if (file.endsWith('.map')) rmSync(join(outDir, file))
      }
    },
  }
}

// Source maps exist only to be uploaded to Grafana Cloud, so a stack trace from
// a visitor's browser reads as source. They are built 'hidden' (no
// sourceMappingURL comment) and the uploader deletes them from dist/ once sent,
// so none is ever served. With no upload credentials, none is built at all.
// The FARO_SOURCEMAP_* names have no VITE_ prefix, so they never reach the bundle.
function sourceMapUpload(): Plugin[] {
  const { FARO_SOURCEMAP_ENDPOINT, FARO_SOURCEMAP_API_KEY, FARO_APP_ID, FARO_STACK_ID } = process.env
  if (!FARO_SOURCEMAP_ENDPOINT || !FARO_SOURCEMAP_API_KEY || !FARO_APP_ID || !FARO_STACK_ID) return []
  const upload = faroUploader({
    appName: FARO_APP_NAME,
    endpoint: FARO_SOURCEMAP_ENDPOINT,
    apiKey: FARO_SOURCEMAP_API_KEY,
    appId: FARO_APP_ID,
    stackId: FARO_STACK_ID,
    gitHash: process.env.VERCEL_GIT_COMMIT_SHA,
    gzipContents: true,
  }) as Plugin
  return [upload, deleteSourceMaps()]
}

function linkPreviewPlugin(): Plugin {
  return {
    name: 'link-preview',
    transformIndexHtml: withDefaultPreview,
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL
  const railTilesUrl = process.env.VITE_RAIL_TILES_URL ?? env.VITE_RAIL_TILES_URL
  // The API and rail-tile hosts live only in Vercel's env settings, out of the
  // repo's sight. A Vercel build (a PR preview included) whose host
  // vercel.json's CSP does not name fails here, rather than shipping a page
  // whose every request to it the browser blocks once the CSP is enforced.
  // Local and CI builds skip this.
  if (command === 'build' && process.env.VERCEL) {
    const vercelConfig = JSON.parse(readFileSync(resolve(process.cwd(), 'vercel.json'), 'utf8')) as {
      headers?: VercelHeaderRule[]
    }
    const headers = vercelConfig.headers ?? []
    const problem = apiOriginMissingFromCsp(headers, apiBaseUrl) ?? railTilesOriginMissingFromCsp(headers, railTilesUrl)
    if (problem) throw new Error(problem)
  }
  const stadiaApiKey = process.env.VITE_STADIA_API_KEY ?? env.VITE_STADIA_API_KEY
  const upload = sourceMapUpload()
  const uploadingSourceMaps = upload.length > 0
  return {
    plugins: [vue(), tailwindcss(), preconnectPlugin(apiBaseUrl, stadiaApiKey), linkPreviewPlugin(), ...upload],
    build: {
      sourcemap: uploadingSourceMaps ? 'hidden' : false,
    },
    define: {
      // Vercel sets the commit SHA at build time; local builds show "dev".
      __BUILD_VERSION__: JSON.stringify(shortCommitSha(process.env.VERCEL_GIT_COMMIT_SHA)),
    },
    test: {
      environment: 'happy-dom',
      include: ['src/**/*.spec.ts', 'middleware.spec.ts'],
      setupFiles: ['src/test/setup.ts'],
    },
  }
})
