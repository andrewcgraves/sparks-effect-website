<script setup lang="ts">
import ExternalLink from '../components/ExternalLink.vue'
import ProsePage from '../components/ProsePage.vue'
import { PROSE_LEAD_CLASS, PROSE_LIST_CLASS, PROSE_P_CLASS } from '../components/proseStyles'

const UPDATED = '2026-10-17'

// Of the links calelectricrail.org lists, Get involved and X are left out by choice (SPA-525).
const CER_LINKS = [
  { label: 'Website', href: 'https://calelectricrail.org' },
  { label: 'Bluesky', href: 'https://bsky.app/profile/calelectricrail.org' },
]
</script>

<template>
  <ProsePage
    title="About"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      The “sparks effect” is a term from British railway planning for the rise in passenger numbers
      that often follows the electrification of a line, beyond what faster journeys, more frequent
      services and better reliability alone would predict.
    </p>
    <p :class="PROSE_P_CLASS">
      This site exists to help advocates organize around lines that would benefit their community.
      It gives them one place to share those lines, and to show politicians the case for change.
    </p>
    <p :class="PROSE_P_CLASS">
      Built and maintained by volunteers at Californians for Electric Rail.
    </p>
    <!-- Word for word from calelectricrail.org/about's "Who we are" on 2026-10-17. -->
    <p :class="PROSE_P_CLASS">
      Californians for Electric Rail is a volunteer organization with members around the state,
      dedicated to connecting transit advocates and railfans with environmentalists, unions, good
      government advocates, and other supporters of environmentally-friendly, union-made,
      cost-effective rail.
    </p>
    <p :class="PROSE_P_CLASS">
      We are committed to removing barriers to electrification via overhead catenary of
      California's railways through state legislative advocacy and engagement in decision-making
      within local transit agencies and regulatory boards.
    </p>
    <p :class="PROSE_P_CLASS">
      If you’d like to get more involved, follow these links:
    </p>
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
