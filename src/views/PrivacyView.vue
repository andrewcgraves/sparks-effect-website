<script setup lang="ts">
import ExternalLink from '../components/ExternalLink.vue'
import ProsePage from '../components/ProsePage.vue'
import {
  PROSE_H2_CLASS,
  PROSE_H3_CLASS,
  PROSE_LEAD_CLASS,
  PROSE_LINK_CLASS,
  PROSE_LIST_CLASS,
  PROSE_P_CLASS,
} from '../components/proseStyles'
import { CONTACT_EMAIL, CONTACT_MAILTO } from '../legal/contact'

const UPDATED = '2026-10-10'

const PROCESSORS = [
  {
    name: 'Vercel',
    href: 'https://vercel.com/legal/privacy-policy',
    role: 'hosts the site and runs its analytics.',
  },
  {
    name: 'Railway',
    href: 'https://railway.com/legal/privacy',
    role: 'runs our API and the database that holds accounts and the lines, networks and routes people create.',
  },
  {
    name: 'Stadia Maps',
    href: 'https://stadiamaps.com/privacy/',
    role: 'answers address searches and "use my location" lookups, and serves map tiles on preview deployments.',
  },
  {
    name: 'OpenFreeMap',
    href: 'https://openfreemap.org/',
    role: 'serves the map tiles.',
  },
  {
    name: 'Grafana Cloud',
    href: 'https://grafana.com/legal/privacy-policy/',
    role: 'receives error reports from the site and the API, and the logs of the cluster that computes splash zones.',
  },
]
</script>

<template>
  <ProsePage
    title="Privacy policy"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      This policy says what Sparks Effect collects when you use sparks-effect.app, why, who handles
      it on our behalf, and how to ask about it. There are no cookies and no advertising.
    </p>

    <h2
      id="what-we-collect"
      :class="PROSE_H2_CLASS"
    >
      What we collect, and why
    </h2>

    <h3 :class="PROSE_H3_CLASS">
      Plotting a splash zone
    </h3>
    <p :class="PROSE_P_CLASS">
      When you plot a splash zone, your browser sends the starting point you chose, the travel mode
      and the time budget to our API, which works out the answer. The API also sees your IP address,
      which it uses to limit how fast any one address can make requests. Each request carries a
      random trace id, and the API's logs and the routing logs record that id with the request, not
      your name.
    </p>
    <p :class="PROSE_P_CLASS">
      The starting point is written into the page's address so you can share or bookmark the plot.
      Anyone you send that link to can see where it starts.
    </p>

    <h3 :class="PROSE_H3_CLASS">
      Address search and your location
    </h3>
    <p :class="PROSE_P_CLASS">
      What you type into the address box, once it is three characters long, goes straight from your
      browser to Stadia Maps, which finds matching places. If you press "use my location", your
      browser asks your permission first, and then sends your coordinates to Stadia Maps to name the
      place. We never ask for your location unless you press that button.
    </p>

    <h3 :class="PROSE_H3_CLASS">
      Map tiles
    </h3>
    <p :class="PROSE_P_CLASS">
      The map is drawn from tiles your browser fetches from OpenFreeMap, which sees your IP address
      as any web server does. Preview deployments fetch their tiles from Stadia Maps instead.
    </p>

    <h3 :class="PROSE_H3_CLASS">
      Analytics
    </h3>
    <p :class="PROSE_P_CLASS">
      We use Vercel Web Analytics to count page views. It sets no cookies and does not identify you;
      it reports the page address, with any sign-in link stripped out first. We also record a few
      events of our own: that a splash zone was requested, with its mode and time budget; that the
      travel mode was switched; that an address search ran, with how many matches came back but
      never what you typed; and that a request failed.
    </p>

    <h3 :class="PROSE_H3_CLASS">
      Error reports
    </h3>
    <p :class="PROSE_P_CLASS">
      If something goes wrong in your browser, the error is reported to Grafana Cloud with the
      address of the page it happened on, which includes a plotted starting point, the build
      version, your browser and screen details, and a random session identifier that lasts your
      visit. Before anything is sent it is scrubbed of sign-in tokens, passwords and set-password
      links. Reports leave the browser from deployed builds, the live site and its previews, and
      never from local development.
    </p>

    <h3 :class="PROSE_H3_CLASS">
      Accounts
    </h3>
    <p :class="PROSE_P_CLASS">
      Accounts are by invitation only. An account stores your email address, a display name if you
      set one, and a hash of your password, never the password itself. Signing in keeps a session
      token in your browser's local storage, not a cookie, until you sign out or the session expires
      24 hours after you signed in.
    </p>
    <p :class="PROSE_P_CLASS">
      Lines, networks and routes you create are stored with your account, with the times they were
      made and changed. Publishing a line makes its page visible to anyone, with the name and
      description you gave it. Your email address is never shown on it.
    </p>

    <h2
      id="cookies"
      :class="PROSE_H2_CLASS"
    >
      Cookies and local storage
    </h2>
    <p :class="PROSE_P_CLASS">
      Sparks Effect sets no cookies, so there is no cookie banner. If you sign in, your browser's
      local storage holds your session token and the drafts of lines and networks you are working
      on, filed under your account's id so they survive a reload. The error reporter keeps its
      session identifier in session storage for the length of your visit. Nothing in either store
      is read by anyone but this site, and clearing the site's data removes all of it.
    </p>

    <h2
      id="processors"
      :class="PROSE_H2_CLASS"
    >
      Who handles it on our behalf
    </h2>
    <ul
      :class="PROSE_LIST_CLASS"
      data-testid="processors"
    >
      <li
        v-for="processor in PROCESSORS"
        :key="processor.name"
      >
        <strong><ExternalLink :href="processor.href">{{ processor.name }}</ExternalLink></strong>
        {{ processor.role }}
      </li>
    </ul>
    <p :class="PROSE_P_CLASS">
      Each of them handles data under its own privacy policy, linked above. We do not sell data,
      and we share it with no one else unless the law requires it.
    </p>

    <h2
      id="retention"
      :class="PROSE_H2_CLASS"
    >
      How long we keep it
    </h2>
    <ul :class="PROSE_LIST_CLASS">
      <li>A session ends 24 hours after sign-in, or when you sign out, and is deleted then.</li>
      <li>Account details and the things you create are kept while the account exists.</li>
      <li>Server logs and error reports are kept for a limited time by each provider and then discarded.</li>
      <li>Analytics are kept only as counts.</li>
    </ul>

    <h2
      id="your-choices"
      :class="PROSE_H2_CLASS"
    >
      Your choices
    </h2>
    <p :class="PROSE_P_CLASS">
      You can change your display name and password on your Account page, and unpublish any line
      you published. To see what we hold about you, correct it, or have your account and everything
      it owns deleted, email
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>
      from the address on the account. Deleting an account unpublishes its lines. We answer within
      30 days.
    </p>
    <p :class="PROSE_P_CLASS">
      The site is not aimed at children under 13, and we do not knowingly hold their data.
    </p>

    <h2
      id="changes"
      :class="PROSE_H2_CLASS"
    >
      Changes to this policy
    </h2>
    <p :class="PROSE_P_CLASS">
      When this policy changes, the date at the top changes with it. If a change means your data
      is used in a new way, we will say so on the site before it takes effect.
    </p>
  </ProsePage>
</template>
