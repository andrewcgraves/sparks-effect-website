import globals from 'globals'
import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import { defineConfig, globalIgnores } from 'eslint/config'

// eslint-plugin-vue's own default for the two content-newline rules, which
// setting `ignores` replaces rather than extends.
const INLINE_ELEMENTS = [
  'pre', 'textarea',
  'a', 'abbr', 'audio', 'b', 'bdi', 'bdo', 'canvas', 'cite', 'code', 'data', 'del', 'dfn', 'em', 'i',
  'iframe', 'ins', 'kbd', 'label', 'map', 'mark', 'noscript', 'object', 'output', 'picture', 'q', 'ruby',
  's', 'samp', 'small', 'span', 'strong', 'sub', 'sup', 'svg', 'time', 'u', 'var', 'video',
]

// A link component is as inline as the <a> it renders. Breaking its text onto
// lines of its own puts a space inside the link, which running prose (the
// legal pages, the footer's credits) shows as an underlined gap. A Tag is as
// inline as its <span>, and the same space would sit inside its border.
const INLINE_COMPONENTS = ['RouterLink', 'router-link', 'ExternalLink', 'Tag']

// The rule guards against names HTML may one day take. Notice and Tag name
// the design system's own parts and are not elements, so they keep one word.
const ONE_WORD_COMPONENTS = ['Notice', 'Tag']

export default defineConfig([
  globalIgnores(['dist', 'node_modules']),
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,vue}'],
    languageOptions: {
      globals: { ...globals.browser, __BUILD_VERSION__: 'readonly' },
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      'vue/multi-word-component-names': ['error', { ignores: ONE_WORD_COMPONENTS }],
      'vue/singleline-html-element-content-newline': ['warn', { ignores: [...INLINE_ELEMENTS, ...INLINE_COMPONENTS] }],
      'vue/multiline-html-element-content-newline': ['warn', { ignores: [...INLINE_ELEMENTS, ...INLINE_COMPONENTS] }],
    },
  },
])
