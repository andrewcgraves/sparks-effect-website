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
// legal pages, the footer's credits) shows as an underlined gap.
const INLINE_COMPONENTS = ['RouterLink', 'router-link', 'ExternalLink']

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
      'vue/singleline-html-element-content-newline': ['warn', { ignores: [...INLINE_ELEMENTS, ...INLINE_COMPONENTS] }],
      'vue/multiline-html-element-content-newline': ['warn', { ignores: [...INLINE_ELEMENTS, ...INLINE_COMPONENTS] }],
    },
  },
])
