/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type HtmlTagDescriptor, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { shortCommitSha } from './src/buildVersion.ts'
import { resolveTilePreconnectOrigin } from './src/tileHost.ts'
import { safeHttpOrigin } from './src/preconnect.ts'
import { withDefaultPreview } from './src/share/linkPreview.ts'

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

function linkPreviewPlugin(): Plugin {
  return {
    name: 'link-preview',
    transformIndexHtml: withDefaultPreview,
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? env.VITE_API_BASE_URL
  const stadiaApiKey = process.env.VITE_STADIA_API_KEY ?? env.VITE_STADIA_API_KEY
  return {
    plugins: [vue(), tailwindcss(), preconnectPlugin(apiBaseUrl, stadiaApiKey), linkPreviewPlugin()],
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
