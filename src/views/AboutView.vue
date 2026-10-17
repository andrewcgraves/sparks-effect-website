<script setup lang="ts">
import ExternalLink from '../components/ExternalLink.vue'
import ProsePage from '../components/ProsePage.vue'
import { PROSE_H2_CLASS, PROSE_LEAD_CLASS, PROSE_LIST_CLASS, PROSE_P_CLASS } from '../components/proseStyles'

const UPDATED = '2026-10-16'

// Every account calelectricrail.org lists, as read on 2026-10-16 (SPA-525).
const CER_LINKS = [
  { label: 'Website', href: 'https://calelectricrail.org' },
  { label: 'Get involved', href: 'https://calelectricrail.org/contact/' },
  { label: 'Bluesky', href: 'https://bsky.app/profile/calelectricrail.org' },
  { label: 'X', href: 'https://twitter.com/calelectricrail' },
]
</script>

<template>
  <ProsePage
    title="About"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      Built with love by Californians for Electric Rail, and maintained by volunteers.
    </p>
    <p :class="PROSE_P_CLASS">
      We don't take donations. We donate to SFA and to
      <ExternalLink href="https://railpac.org/">RailPAC</ExternalLink>, the Rail Passenger Association
      of California and Nevada, instead.
    </p>

    <h2
      id="follow"
      :class="PROSE_H2_CLASS"
    >
      Follow Californians for Electric Rail
    </h2>
    <ul
      :class="PROSE_LIST_CLASS"
      data-testid="cer-links"
    >
      <li
        v-for="link in CER_LINKS"
        :key="link.href"
      >
        <ExternalLink :href="link.href">
          {{ link.label }}
        </ExternalLink>
      </li>
    </ul>
  </ProsePage>
</template>
