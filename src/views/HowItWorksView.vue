<script setup lang="ts">
import ExternalLink from '../components/ExternalLink.vue'
import MapTour from '../components/MapTour.vue'
import ProsePage from '../components/ProsePage.vue'
import {
  PROSE_H2_CLASS,
  PROSE_LEAD_CLASS,
  PROSE_LINK_CLASS,
  PROSE_LIST_CLASS,
  PROSE_P_CLASS,
} from '../components/proseStyles'

const UPDATED = '2026-10-13'
</script>

<template>
  <ProsePage
    title="How it works"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      A splash zone shows everywhere you could get from one starting point within the travel time
      you pick, riding a line or network for part of the trip. Here is a sample map. Step through
      it to see what each colour means.
    </p>

    <section>
      <h2 :class="PROSE_H2_CLASS">
        How to read the map
      </h2>
      <MapTour />
    </section>

    <section>
      <h2 :class="PROSE_H2_CLASS">
        The fine print
      </h2>
      <ul :class="PROSE_LIST_CLASS">
        <li>
          <strong class="text-ink">Departure time.</strong> Transit trips leave at 8 a.m. Pacific
          time on a weekday: today if today is a weekday, even after 8 a.m., otherwise the coming
          Monday. Public holidays count as weekdays. Walk, Bike and Drive take the same time
          whatever the hour. Saved splash zones on a network's page keep the weekday they were
          plotted on.
        </li>
        <li>
          <strong class="text-ink">Door to door.</strong> The minutes run from leaving the start to
          arriving, including waits for local buses and trains. With Transit, if walking to a
          station is quicker, or nothing runs, the trip walks the whole way, and
          <em>Time remaining</em> says Walk.
        </li>
        <li>
          <strong class="text-ink">Boarding the line.</strong> The line has no timetable, so by
          default no wait to board it is added. If a line or network sets one, it's added once,
          when you first board. Changing between the network's own lines at a shared station adds
          no time.
        </li>
        <li>
          <strong class="text-ink">Heading out.</strong> You head out from the station you step off
          at by the same mode you set out with: Drive assumes a car waits there; Bike, that your
          bike rides the line with you. Driving assumes free-flowing roads.
        </li>
        <li>
          <strong class="text-ink">Line times.</strong> Lines drawn on this site are timed from
          their path and vehicles: the distance between stations, top speed, acceleration and
          braking, tight curves and steep grades where recorded, and time stood at each station.
          Curated networks such as California High-Speed Rail use run times from published plans
          instead, estimated where a plan gives none.
        </li>
        <li>
          <strong class="text-ink">Streets and timetables.</strong> Walking, biking and driving
          follow California and Nevada's streets and paths in OpenStreetMap, routed by
          <ExternalLink href="https://github.com/valhalla/valhalla">Valhalla</ExternalLink>. Local
          transit follows the timetables of most public agencies in both states, from the
          <ExternalLink href="https://mobilitydatabase.org">Mobility Database</ExternalLink> and
          other publishers. A new set is built every week but switched in by hand once checked, so
          timetables can be a few weeks old.
        </li>
        <li>
          <strong class="text-ink">Not modelled.</strong> Fares, crowding, weekends and evenings,
          traffic, and delays: local transit runs exactly to timetable.
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
  </ProsePage>
</template>
