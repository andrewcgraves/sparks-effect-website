/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss()],
  test: {
    // Building the DOM was by far the most expensive thing this suite did —
    // several times what running the tests themselves cost — so it is attacked
    // from both ends.
    //
    // happy-dom rather than jsdom: same 964 tests, none skipped, at roughly a
    // third of the setup cost. It implements less of the web platform than
    // jsdom does, so a spec that reaches for something obscure may need jsdom
    // back; that is a one-line change here plus `npm i -D jsdom`.
    //
    // A DOM is still the default, because most specs here mount components and
    // one that does not need a DOM passes with it anyway — so the cost of
    // forgetting to classify a new spec is that it runs slower, never that it
    // breaks. Specs touching no DOM at all opt out per-file with
    //
    //   // @vitest-environment node
    //
    // Per-file rather than a glob here: the annotation is visible to whoever
    // opens the spec, and it cannot silently capture a file that later grows a
    // `mount()`, since such a file then fails loudly. Note that "uses no DOM
    // API directly" is not sufficient — see themeTokens.spec.ts, which must
    // keep a DOM because the code under test branches on whether it has one.
    environment: 'happy-dom',
    include: ['src/**/*.spec.ts'],
    setupFiles: ['src/test/setup.ts'],
  },
})
