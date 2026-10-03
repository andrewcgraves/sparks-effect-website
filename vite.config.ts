/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { shortCommitSha } from './src/buildVersion.ts'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  define: {
    // Vercel sets the commit SHA at build time; local builds show "dev".
    __BUILD_VERSION__: JSON.stringify(shortCommitSha(process.env.VERCEL_GIT_COMMIT_SHA)),
  },
  test: {
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
