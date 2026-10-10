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

// Both pages are linked only once their routes land (How it works is SPA-418,
// Report a problem is SPA-421), so these terms can ship ahead of them.
const hasHowItWorks = useRoutedPath('/how-it-works')
const hasReport = useRoutedPath('/report')

const ACCEPTABLE_USE = [
  'is unlawful, harassing, hateful or sexually explicit;',
  'presents a hypothetical line as a real or official plan, or passes itself off as the work of a transit agency, a government or another person;',
  'contains another person\'s personal information without their consent;',
  'infringes anyone\'s copyright or other rights;',
  'carries advertising, spam or links to malware.',
]
</script>

<template>
  <ProsePage
    title="Terms of use"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      Sparks Effect is a free, experimental tool for sketching hypothetical transit lines and seeing
      where they would let you reach. By using sparks-effect.app you agree to these terms.
    </p>

    <h2
      id="what-it-is"
      :class="PROSE_H2_CLASS"
    >
      What Sparks Effect is
    </h2>
    <p :class="PROSE_P_CLASS">
      Sparks Effect is a personal project. It is offered free of charge, as it is, and it may change
      or go away without notice. Anyone may look at the published lines and networks; creating them
      needs an account.
    </p>

    <h2
      id="accounts"
      :class="PROSE_H2_CLASS"
    >
      Accounts
    </h2>
    <p :class="PROSE_P_CLASS">
      Accounts are created by invitation. Keep your password to yourself: you are responsible for
      whatever is done with your account. We may close an account that breaks these terms.
    </p>

    <h2
      id="your-content"
      :class="PROSE_H2_CLASS"
    >
      Content you publish
    </h2>
    <p :class="PROSE_P_CLASS">
      You keep ownership of the lines, networks and routes you create. By publishing a line you give
      us a non-exclusive, worldwide, royalty-free licence to host, display and distribute it on the
      site and in link previews for as long as it stays published, and you let anyone view it and
      link to it. You confirm that you have the right to publish it. Unpublishing withdraws the
      page.
    </p>

    <h2
      id="acceptable-use"
      :class="PROSE_H2_CLASS"
    >
      Acceptable use
    </h2>
    <p :class="PROSE_P_CLASS">
      A published page sits on our domain, so it carries our name. Do not publish or submit anything
      that:
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
    <p :class="PROSE_P_CLASS">
      Do not try to break the site either: no getting round its rate limits, no bulk scraping of its
      API, no probing it for weaknesses. If you find a security problem, tell us at
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>.
    </p>

    <h2
      id="takedown"
      :class="PROSE_H2_CLASS"
    >
      Moderation and takedown
    </h2>
    <p :class="PROSE_P_CLASS">
      We may unpublish or remove any content that breaks these terms, or that someone with a legal
      claim to it asks us to remove, and we may do so without notice when the content is harmful.
      Where we can, we tell the author why.
    </p>
    <p
      :class="PROSE_P_CLASS"
      data-testid="report-by-email"
    >
      To report a page, email
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>
      with the page's address and what is wrong with it. We review reports as soon as we can,
      usually within a few days, and reply to whoever reported it. If your own page is removed and
      you think that was a mistake, write to the same address.
    </p>
    <p
      v-if="hasReport"
      :class="PROSE_P_CLASS"
    >
      Every published page also has a
      <RouterLink
        to="/report"
        :class="PROSE_LINK_CLASS"
        data-testid="report-link"
      >Report a problem</RouterLink>
      link, which sends us the page's address for you.
    </p>

    <h2
      id="no-warranty"
      :class="PROSE_H2_CLASS"
    >
      No warranty on modelled results
    </h2>
    <p :class="PROSE_P_CLASS">
      A splash zone is an estimate from a model. It rests on open map data, published transit
      schedules and assumptions about how a hypothetical line would run, and it can be wrong.
      Nothing on this site is travel advice, an official plan or a forecast, and no transit agency
      has endorsed it.
    </p>
    <p
      v-if="hasHowItWorks"
      :class="PROSE_P_CLASS"
    >
      <RouterLink
        to="/how-it-works"
        :class="PROSE_LINK_CLASS"
        data-testid="how-it-works-link"
      >How it works</RouterLink>
      explains what the model assumes and what it leaves out.
    </p>
    <p :class="PROSE_P_CLASS">
      The site is provided as it is, with no warranty of any kind. To the extent the law allows, we
      are not liable for any loss arising from using it or from relying on anything it shows.
    </p>

    <h2
      id="data-licences"
      :class="PROSE_H2_CLASS"
    >
      Data licences
    </h2>
    <p :class="PROSE_P_CLASS">
      The map, the street network and the transit schedules come from third parties under their own
      licences, listed on the
      <RouterLink
        to="/attribution"
        :class="PROSE_LINK_CLASS"
        data-testid="terms-attribution"
      >Attribution</RouterLink>
      page. Your use of what the site shows is subject to those licences too, including the Open
      Database License for anything derived from OpenStreetMap.
    </p>

    <h2
      id="changes"
      :class="PROSE_H2_CLASS"
    >
      Changes to these terms
    </h2>
    <p :class="PROSE_P_CLASS">
      We may change these terms; the date at the top says when they last did. Using the site after
      a change means you accept it. Questions go to
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>.
    </p>
  </ProsePage>
</template>
