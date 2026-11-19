<script setup lang="ts">
import { useRoutedPages, useRoutedPath } from '../composables/useRoutedPages'
import { resolveTileCredit } from '../mapStyle'
import { HIT_AREA_CLASS, INLINE_LINK_CLASS } from './linkStyles'

const FOOTER_PAGES = [
  { label: 'About', path: '/about' },
  { label: 'Privacy', path: '/privacy' },
  { label: 'Terms', path: '/terms' },
  { label: 'Attribution', path: '/attribution' },
  { label: 'Report a problem', path: '/report' },
]

const tileCredit = resolveTileCredit()
const buildVersion = __BUILD_VERSION__

const links = useRoutedPages(FOOTER_PAGES)
// The credits each licence requires are always here (SPA-419); only the
// pointer to the full agency list waits for the page that holds it.
const hasAttribution = useRoutedPath('/attribution')
</script>

<template>
  <footer class="t-meta flex flex-col gap-2 px-(--page-gutter) pb-8 text-ink-muted">
    <nav
      v-if="links.length > 0"
      class="flex flex-wrap gap-x-4 gap-y-1"
      data-testid="footer-links"
    >
      <RouterLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        :class="`${INLINE_LINK_CLASS} ${HIT_AREA_CLASS}`"
      >
        {{ link.label }}
      </RouterLink>
    </nav>
    <p>
      Map data © <a
        :class="INLINE_LINK_CLASS"
        href="https://www.openstreetmap.org/copyright"
        target="_blank"
        rel="noopener noreferrer"
      >OpenStreetMap</a> contributors, <a
        :class="INLINE_LINK_CLASS"
        href="https://opendatacommons.org/licenses/odbl/1-0/"
        target="_blank"
        rel="noopener noreferrer"
      >ODbL</a> · Tiles via <a
        :class="INLINE_LINK_CLASS"
        :href="tileCredit.href"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="tile-credit"
      >{{ tileCredit.name }}</a> · <a
        :class="INLINE_LINK_CLASS"
        href="https://www.511.org"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="credit-511"
      >Data provided by 511.org</a><span v-if="hasAttribution"> · Transit schedules from <RouterLink
        to="/attribution#transit-schedules"
        :class="INLINE_LINK_CLASS"
        data-testid="agencies-link"
      >these agencies</RouterLink></span> · Search by <a
        :class="INLINE_LINK_CLASS"
        href="https://stadiamaps.com/attribution/"
        target="_blank"
        rel="noopener noreferrer"
        data-testid="geocoder-credit"
      >Stadia Maps</a>
    </p>
    <p data-testid="build-version">
      Build {{ buildVersion }}
    </p>
  </footer>
</template>
