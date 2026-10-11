<script setup lang="ts">
import ExternalLink from '../components/ExternalLink.vue'
import ProsePage from '../components/ProsePage.vue'
import {
  PROSE_H2_CLASS,
  PROSE_LEAD_CLASS,
  PROSE_LINK_CLASS,
  PROSE_LIST_CLASS,
} from '../components/proseStyles'
import { CONTACT_EMAIL, CONTACT_MAILTO, SOURCE_URL } from '../legal/contact'

const UPDATED = '2026-10-10'
</script>

<template>
  <ProsePage
    title="Privacy policy"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      Sparks Effect sets no cookies, shows no ads and sells no data. The full detail is in the
      <ExternalLink :href="SOURCE_URL">source code</ExternalLink>. To have your data deleted, email
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>.
    </p>

    <h2
      id="what-we-collect"
      :class="PROSE_H2_CLASS"
    >
      What we collect
    </h2>
    <ul :class="PROSE_LIST_CLASS">
      <li>
        <strong>Splash zones:</strong> the starting point, travel mode and time budget, plus your IP
        address for rate limiting. The starting point is in the page link, so anyone you share it
        with sees it.
      </li>
      <li>
        <strong>Address search:</strong> what you type into the address box goes to Stadia Maps, and so
        do your coordinates if you press "use my location" and your browser asks your permission.
      </li>
      <li>
        <strong>Analytics:</strong> cookieless page views and a few usage events, never what you type,
        through Vercel, which also hosts the site.
      </li>
      <li>
        <strong>Error reports:</strong> the error, the page address, the build and your browser, sent
        to Grafana Cloud and scrubbed of sign-in tokens and passwords.
      </li>
      <li>
        <strong>Accounts:</strong> your email address, display name and a hash of your password. Your
        browser's local storage holds your session token, which lasts 24 hours, and your drafts.
        Published lines are public; your email address never is.
      </li>
      <li>
        <strong>Hosting:</strong> our API and database run on Railway; map tiles come from OpenFreeMap.
      </li>
    </ul>
  </ProsePage>
</template>
