<script setup lang="ts">
import MapTour from '../components/MapTour.vue'
import ProsePage from '../components/ProsePage.vue'
import { TOUR_SAMPLE } from '../fixtures/tourSample'
import {
  PROSE_H2_CLASS,
  PROSE_LEAD_CLASS,
  PROSE_LINK_CLASS,
  PROSE_LIST_CLASS,
  PROSE_P_CLASS,
} from '../components/proseStyles'

const UPDATED = '2026-10-13'

// "Little Tokyo, Los Angeles" reads as "Little Tokyo in Los Angeles" mid-sentence.
const startPlace = TOUR_SAMPLE.start.label.replace(', ', ' in ')
</script>

<template>
  <ProsePage
    title="How it works"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      A splash zone shows everywhere you could reach from one starting point in a set time, riding
      a hypothetical line for part of the trip. Step through a real one: {{ TOUR_SAMPLE.budget_mins }}
      minutes by Transit from {{ startPlace }}, on the California High-Speed Rail network.
    </p>

    <h2 :class="PROSE_H2_CLASS">
      How to read the map
    </h2>

    <template #wide>
      <MapTour class="mt-6" />
    </template>

    <template #after>
      <section>
        <h2 :class="PROSE_H2_CLASS">
          The fine print
        </h2>
        <ul :class="PROSE_LIST_CLASS">
          <li>
            <strong class="text-ink">When.</strong> Transit trips leave at 8 a.m. Pacific time on a
            weekday. Walking, biking and driving take the same time at any hour, with no traffic.
          </li>
          <li>
            <strong class="text-ink">Door to door.</strong> The minutes cover the whole trip,
            including waits for local buses and trains. Boarding the line adds no wait unless the
            line sets one, and then only once.
          </li>
          <li>
            <strong class="text-ink">After the station.</strong> You carry on the way you set out, so
            Drive assumes a car is waiting and Bike assumes your bike comes along.
          </li>
          <li>
            <strong class="text-ink">Line times.</strong> Lines drawn on this site are timed from
            their route and vehicles. Curated networks such as California High-Speed Rail use times
            from published plans.
          </li>
          <li>
            <strong class="text-ink">Maps and timetables.</strong> Streets come from OpenStreetMap
            and timetables from transit agencies in California and Nevada. Timetables can be a few
            weeks old.
          </li>
          <li>
            <strong class="text-ink">Not included.</strong> Fares, crowding, weekends, evenings,
            traffic and delays.
          </li>
        </ul>
        <!-- A custom slot, so the link's text sits flush against the sentence
             around it without a stray underlined space. -->
        <p
          :class="PROSE_P_CLASS"
          data-testid="how-it-works-attribution"
        >
          Every source, and the licence it is used under, is credited on the <RouterLink
            v-slot="{ href, navigate }"
            to="/attribution"
            custom
          >
            <a
              :href="href"
              :class="PROSE_LINK_CLASS"
              @click="navigate"
            >Attribution</a>
          </RouterLink> page.
        </p>
      </section>
    </template>
  </ProsePage>
</template>
