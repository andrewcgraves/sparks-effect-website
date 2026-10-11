<script setup lang="ts">
import ProsePage from '../components/ProsePage.vue'
import {
  PROSE_H2_CLASS,
  PROSE_LEAD_CLASS,
  PROSE_LINK_CLASS,
  PROSE_LIST_CLASS,
  PROSE_P_CLASS,
} from '../components/proseStyles'
import { useRoutedPath } from '../composables/useRoutedPages'
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../legal/contact'

const UPDATED = '2026-10-10'

// Linked only once its route lands (SPA-421), so these terms can ship ahead of it.
const hasReport = useRoutedPath('/report')

const ACCEPTABLE_USE = [
  'is unlawful, harassing, hateful or sexually explicit;',
  'passes a hypothetical line off as a real or official plan;',
  'shares someone\'s personal information without their consent, or infringes their rights;',
  'is spam, advertising or malware.',
]
</script>

<template>
  <ProsePage
    title="Terms of use"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      Sparks Effect is a free, experimental personal project. By using sparks-effect.app you agree
      to these terms. It may change or go away without notice.
    </p>

    <h2
      id="your-content"
      :class="PROSE_H2_CLASS"
    >
      Content you publish
    </h2>
    <p :class="PROSE_P_CLASS">
      You keep ownership of what you create. Publishing a line gives us a non-exclusive, worldwide,
      royalty-free licence to show it for as long as it stays published. You are responsible for
      your account and what is published from it.
    </p>

    <h2
      id="acceptable-use"
      :class="PROSE_H2_CLASS"
    >
      Acceptable use
    </h2>
    <p :class="PROSE_P_CLASS">
      Don't try to break the site, and don't publish anything that:
    </p>
    <ul
      :class="PROSE_LIST_CLASS"
      data-testid="acceptable-use"
    >
      <li
        v-for="rule in ACCEPTABLE_USE"
        :key="rule"
      >
        {{ rule }}
      </li>
    </ul>

    <h2
      id="takedown"
      :class="PROSE_H2_CLASS"
    >
      Moderation and takedown
    </h2>
    <p
      :class="PROSE_P_CLASS"
      data-testid="report-by-email"
    >
      We may unpublish or remove content that breaks these terms, or close the account behind it.
      To report a page, or to appeal a removal, email
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>
      with the page's address<template v-if="hasReport">
        , or use its
        <RouterLink
          to="/report"
          :class="PROSE_LINK_CLASS"
          data-testid="report-link"
        >Report a problem</RouterLink>
        link
      </template>.
    </p>
  </ProsePage>
</template>
