<script setup lang="ts">
import ExternalLink from '../components/ExternalLink.vue'
import ProsePage from '../components/ProsePage.vue'
import {
  PROSE_H2_CLASS,
  PROSE_LEAD_CLASS,
  PROSE_LINK_CLASS,
  PROSE_LIST_CLASS,
  PROSE_P_CLASS,
} from '../components/proseStyles'

const UPDATED = '2026-10-10'

const LINE_STATES = [
  {
    state: 'ridden',
    name: 'Ridden',
    look: 'solid black',
    meaning: 'a stretch of the line a trip rides end to end, between two stations.',
  },
  {
    state: 'unridden',
    name: 'Unridden',
    look: 'light grey',
    meaning: 'the rest of the network, which no trip here rides from one station to the next.',
  },
  {
    state: 'unfinished',
    name: 'Unfinished',
    look: 'black dashes ending in a dot',
    meaning: 'a ride the time ran out partway through. The dot, “Budget ran out here” on the map, is where, not a station.',
  },
] as const
</script>

<template>
  <ProsePage
    title="How it works"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      A splash zone shows everywhere you could get to from one starting point within the travel
      time you pick, riding a hypothetical line or network for part of the trip. Here is what that
      claim includes, and what it leaves out.
    </p>

    <figure class="mt-10">
      <!-- Sized so the smallest label still renders at 12px or more on a
           375px-wide phone: the viewBox is no wider than the column there. -->
      <svg
        class="block h-auto w-full max-w-[440px] text-ink"
        viewBox="0 0 332 186"
        role="img"
        aria-labelledby="how-it-works-diagram-title how-it-works-diagram-desc"
        data-testid="how-it-works-diagram"
      >
        <title id="how-it-works-diagram-title">One trip through a splash zone</title>
        <desc id="how-it-works-diagram-desc">
          From the starting point, you get to a station by walking, biking, driving or local
          transit. The blue area, Origin reach, is everywhere you could get without boarding the
          line, and that station sits inside it. You ride the line to another station, then head
          out from it the same way with the minutes left. The orange area, From station, is
          everywhere you could get from there.
        </desc>
        <ellipse
          cx="78"
          cy="112"
          rx="66"
          ry="46"
          class="fill-data-origin"
          fill-opacity="0.16"
        />
        <ellipse
          cx="266"
          cy="112"
          rx="58"
          ry="46"
          class="fill-data-egress"
          fill-opacity="0.22"
        />
        <line
          x1="42"
          y1="112"
          x2="113"
          y2="112"
          class="stroke-data-origin"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-dasharray="2 5"
        />
        <line
          x1="120"
          y1="112"
          x2="248"
          y2="112"
          stroke="currentColor"
          stroke-width="3"
          stroke-linecap="round"
        />
        <g
          stroke="currentColor"
          stroke-width="2.5"
          stroke-linecap="round"
          stroke-dasharray="2 5"
          fill="none"
        >
          <line
            x1="254"
            y1="107"
            x2="306"
            y2="86"
          />
          <line
            x1="254"
            y1="117"
            x2="302"
            y2="140"
          />
        </g>
        <circle
          cx="36"
          cy="112"
          r="5.5"
          class="fill-coral"
        />
        <g
          class="fill-data-egress"
          stroke="currentColor"
          stroke-width="2"
        >
          <circle
            cx="120"
            cy="112"
            r="5"
          />
          <circle
            cx="184"
            cy="112"
            r="5"
          />
          <circle
            cx="248"
            cy="112"
            r="5"
          />
        </g>
        <g
          fill="currentColor"
          font-size="14"
          font-weight="700"
          text-anchor="middle"
        >
          <text
            x="78"
            y="22"
          >Get to</text>
          <text
            x="78"
            y="40"
          >a station</text>
          <text
            x="184"
            y="22"
          >Ride</text>
          <text
            x="184"
            y="40"
          >the line</text>
          <text
            x="286"
            y="22"
          >Head out</text>
          <text
            x="286"
            y="40"
          >from it</text>
        </g>
        <g
          fill="currentColor"
          font-size="13"
          text-anchor="middle"
        >
          <text
            x="36"
            y="136"
          >Start</text>
          <text
            x="78"
            y="177"
          >Origin reach</text>
          <text
            x="266"
            y="177"
          >From station</text>
        </g>
      </svg>
      <figcaption class="font-body text-caption mt-3 text-ink-muted">
        One trip, and the two areas it shades on the map.
      </figcaption>
    </figure>

    <section>
      <h2 :class="PROSE_H2_CLASS">
        What you're looking at
      </h2>
      <p :class="PROSE_P_CLASS">
        Pick a starting point, a travel time and a mode: Walk, Bike, Drive or Transit. The blue
        area, <em>Origin reach</em>, is where you could get without boarding the line at all.
        Each orange area, <em>From station</em>, is where you could get from a station you rode
        the line to, with whatever minutes were left. Together they are the splash zone.
      </p>
      <p :class="PROSE_P_CLASS">
        The line itself is drawn three ways:
      </p>
      <ul
        class="mt-3 flex flex-col gap-2"
        data-testid="line-state-legend"
      >
        <li
          v-for="entry in LINE_STATES"
          :key="entry.state"
          class="font-body text-body flex items-baseline gap-3 text-ink-muted"
          :data-testid="`line-state-${entry.state}`"
        >
          <span
            class="flex w-8 shrink-0 items-center self-center"
            aria-hidden="true"
          >
            <span
              v-if="entry.state === 'unfinished'"
              class="flex w-full items-center"
            >
              <span class="block flex-1 border-t-[3px] border-dashed border-ink" />
              <span class="ml-0.5 block size-2 rounded-full bg-ink" />
            </span>
            <span
              v-else
              class="block h-[3px] w-full rounded-full"
              :class="entry.state === 'ridden' ? 'bg-ink' : 'bg-ink-faint'"
            />
          </span>
          <span>
            <strong class="text-ink">{{ entry.name }}</strong> ({{ entry.look }}): {{ entry.meaning }}
          </span>
        </li>
      </ul>
    </section>

    <section>
      <h2 :class="PROSE_H2_CLASS">
        What time of day
      </h2>
      <p :class="PROSE_P_CLASS">
        A Transit trip leaves the starting point at 8 a.m. Pacific time on a weekday: today if
        today is a weekday, even once 8 a.m. has passed, otherwise the coming Monday. You can't
        pick another time. It answers “what does this network reach on a typical weekday
        morning?”, not “when should I leave?” Onward local transit runs to the timetable for when
        you would actually reach the station.
      </p>
      <p :class="PROSE_P_CLASS">
        Walk, Bike and Drive take the same time whatever the hour. Saved splash zones on a
        network's page keep the weekday they were plotted on, not today.
      </p>
    </section>

    <section>
      <h2 :class="PROSE_H2_CLASS">
        What the minutes include
      </h2>
      <p :class="PROSE_P_CLASS">
        The travel time is door to door: from leaving the starting point to arriving, counting
        minutes spent waiting for local transit as well as moving. A trip that rides the line
        counts:
      </p>
      <ul :class="PROSE_LIST_CLASS">
        <li>
          getting to a station by your mode. With Transit, that includes waiting for a local bus
          or train. If walking is quicker, or nothing runs, the trip walks the whole way, and
          <em>Time remaining</em> says Walk;
        </li>
        <li>riding the line, including the time spent stopped at each station;</li>
        <li>heading out from the station you step off at, by the same mode, with the minutes left.</li>
      </ul>
      <p :class="PROSE_P_CLASS">
        By default, no wait to board the hypothetical line is added, since it has no timetable. If
        a line or network has a wait set, it is added once, when you first board.
      </p>
    </section>

    <section>
      <h2 :class="PROSE_H2_CLASS">
        Where the numbers come from
      </h2>
      <p :class="PROSE_P_CLASS">
        Walking, biking and driving follow the streets and paths of California and Nevada in
        OpenStreetMap, routed by <ExternalLink href="https://github.com/valhalla/valhalla">Valhalla</ExternalLink>,
        an open-source routing engine.
      </p>
      <p :class="PROSE_P_CLASS">
        Local transit follows the published timetables of most public agencies in California and
        Nevada, gathered from the <ExternalLink href="https://mobilitydatabase.org">Mobility Database</ExternalLink>
        and other open-data publishers. A new set is built every week but switched in by hand once
        checked, so the timetables in use can be a few weeks old.
      </p>
      <p :class="PROSE_P_CLASS">
        Lines drawn on this site get their times from the path each is drawn along and the
        vehicles that run on it: the distance between stations, top speed, acceleration and
        braking, slower running through tight curves and down steep grades where
        recorded, and how long they stand at each station. Curated networks such as California
        High-Speed Rail instead use run times taken from published plans, or estimated where a
        plan gives none, plus a stop at each station.
      </p>
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

    <section>
      <h2 :class="PROSE_H2_CLASS">
        What it doesn't model
      </h2>
      <ul :class="PROSE_LIST_CLASS">
        <li><strong class="text-ink">Fares.</strong> What a trip costs plays no part.</li>
        <li><strong class="text-ink">Crowding.</strong> There is always room on board.</li>
        <li>
          <strong class="text-ink">Weekends and evenings.</strong> A public holiday still counts
          as a weekday, on that day's local timetable.
        </li>
        <li>
          <strong class="text-ink">Transfer penalties.</strong> Changing between the network's own
          lines at a shared station adds no time, even a short walk between platforms.
        </li>
        <li>
          <strong class="text-ink">Parking and bikes on board.</strong> Drive assumes a car waits
          where you step off; Bike, that your bike rides the line with you.
        </li>
        <li><strong class="text-ink">Traffic.</strong> Driving assumes free-flowing roads.</li>
        <li>
          <strong class="text-ink">Delays.</strong> Local transit runs exactly to timetable.
        </li>
      </ul>
    </section>
  </ProsePage>
</template>
