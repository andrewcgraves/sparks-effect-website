<script setup lang="ts">
import { useRoutedPages } from '../composables/useRoutedPages'
import { resolveTileCredit } from '../mapStyle'
import { FOOTER_LINK_CLASS } from './linkStyles'

const FOOTER_PAGES = [
  { label: 'How it works', path: '/how-it-works' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Terms', path: '/terms' },
  { label: 'Attribution', path: '/attribution' },
  { label: 'Report a problem', path: '/report' },
]

const tileCredit = resolveTileCredit()
const buildVersion = __BUILD_VERSION__

const links = useRoutedPages(FOOTER_PAGES)
</script>

<template>
  <footer class="font-body text-micro flex flex-col gap-2 px-(--page-gutter) pb-8 text-ink-muted">
    <nav
      v-if="links.length > 0"
      class="flex flex-wrap gap-x-4 gap-y-1"
      data-testid="footer-links"
    >
      <RouterLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        :class="FOOTER_LINK_CLASS"
      >
        {{ link.label }}
      </RouterLink>
    </nav>
    <p>
      Map data © <a
        class="underline"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >OpenStreetMap</a> contributors · Tiles via <a
        class="underline"
        :href="tileCredit.href"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="tile-credit"
      >{{ tileCredit.name }}</a>
    </p>
    <p data-testid="build-version">
      Build {{ buildVersion }}
    </p>
  </footer>
</template>
