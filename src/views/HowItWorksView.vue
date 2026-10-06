<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { FOOTER_LINK_CLASS } from '../components/linkStyles'

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
    meaning: 'the rest of the network, which no trip in this splash zone needed.',
  },
  {
    state: 'unfinished',
    name: 'Unfinished',
    look: 'black dashes ending in a dot',
    meaning: 'a ride the time ran out partway through. The dot is where it ran out, not a station.',
  },
] as const

const router = useRouter()

// The same rule as the footer: the attribution page is linked only once its
// route lands, so this page can ship ahead of it.
const hasAttribution = computed(() => router.getRoutes().some((route) => route.path === '/attribution'))

const SECTION_HEADING_CLASS = 'font-display text-h2 text-ink-true'
const PROSE_CLASS = 'font-body text-body mt-3 text-ink-muted'
const PROSE_LINK_CLASS = `${FOOTER_LINK_CLASS} text-ink`
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <article class="max-w-[720px]">
      <h1 class="font-display text-display text-ink-true">
        How it works
      </h1>
      <p class="font-body text-lead mt-6 text-ink-muted">
        A splash zone shows everywhere you could get to from one starting point within the travel
        time you pick, riding a hypothetical line or network for part of the trip. Here is what that
        claim includes, and what it leaves out.
      </p>

      <figure class="mt-10">
        <svg
          class="block h-auto w-full max-w-[520px] text-ink"
          viewBox="0 0 360 170"
          role="img"
          aria-labelledby="how-it-works-diagram-title how-it-works-diagram-desc"
          data-testid="how-it-works-diagram"
        >
          <title id="how-it-works-diagram-title">One trip through a splash zone</title>
          <desc id="how-it-works-diagram-desc">
            From the starting point, an access leg reaches a station by walking, biking, driving or
            local transit. The hypothetical line carries the trip to another station. From there,
            an egress leg uses the minutes left, and the area it covers is the reach from that station.
          </desc>
          <ellipse
            cx="34"
            cy="92"
            rx="30"
            ry="26"
            class="fill-data-origin"
            fill-opacity="0.18"
          />
          <ellipse
            cx="282"
            cy="96"
            rx="70"
            ry="40"
            class="fill-data-egress"
            fill-opacity="0.3"
          />
          <line
            x1="40"
            y1="92"
            x2="118"
            y2="92"
            class="stroke-data-origin"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-dasharray="2 5"
          />
          <line
            x1="126"
            y1="92"
            x2="234"
            y2="92"
            stroke="currentColor"
            stroke-width="3"
            stroke-linecap="round"
          />
          <g
            class="stroke-data-egress"
            stroke-width="2.5"
            stroke-linecap="round"
            stroke-dasharray="2 5"
            fill="none"
          >
            <line
              x1="241"
              y1="88"
              x2="322"
              y2="66"
            />
            <line
              x1="241"
              y1="96"
              x2="318"
              y2="120"
            />
          </g>
          <circle
            cx="34"
            cy="92"
            r="5.5"
            class="fill-coral"
          />
          <g
            class="fill-data-egress"
            stroke="currentColor"
            stroke-width="2"
          >
            <circle
              cx="122"
              cy="92"
              r="5"
            />
            <circle
              cx="180"
              cy="92"
              r="5"
            />
            <circle
              cx="238"
              cy="92"
              r="5"
            />
          </g>
          <g
            fill="currentColor"
            font-size="12"
            font-weight="700"
            text-anchor="middle"
          >
            <text
              x="78"
              y="34"
            >Access leg</text>
            <text
              x="180"
              y="34"
            >The line</text>
            <text
              x="290"
              y="34"
            >Egress leg</text>
            <text
              x="34"
              y="158"
            >Start</text>
            <text
              x="282"
              y="158"
            >Reach</text>
          </g>
          <g
            class="fill-ink-muted"
            font-size="10"
            text-anchor="middle"
          >
            <text
              x="78"
              y="50"
            >your mode</text>
            <text
              x="180"
              y="50"
            >ride and stops</text>
            <text
              x="290"
              y="50"
            >minutes left</text>
          </g>
        </svg>
        <figcaption class="font-body text-caption mt-3 text-ink-muted">
          One trip: get to a station, ride the line, then spend the minutes left getting away from
          where you step off.
        </figcaption>
      </figure>

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          What you're looking at
        </h2>
        <p :class="PROSE_CLASS">
          Pick a starting point, a travel time and a mode: Walk, Bike, Drive or Transit. The blue
          area, <em>Origin reach</em>, is where you could get without boarding the line at all.
          Each orange area, <em>From station</em>, is where you could get from a station you rode
          the line to, with whatever minutes were left. Together they are the splash zone.
        </p>
        <p :class="PROSE_CLASS">
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

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          What time of day
        </h2>
        <p :class="PROSE_CLASS">
          Every splash zone leaves the starting point at 8 a.m. Pacific time on a weekday: today, if
          today is a weekday, otherwise the coming Monday. You can't pick another time. It answers
          “what does this network reach on a typical weekday morning?”, not “when should I leave?”
        </p>
        <p :class="PROSE_CLASS">
          The clock matters for local buses and trains, which run to timetables. Onward local transit
          from a station is timetabled for the hour you would actually arrive there, not for 8 a.m.
        </p>
      </section>

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          What the minutes include
        </h2>
        <p :class="PROSE_CLASS">
          The travel time is door to door: from leaving the starting point to arriving, counting
          minutes spent waiting as well as moving. A place is inside the splash zone only if you
          could really be there that soon. A trip that rides the line counts:
        </p>
        <ul class="font-body text-body mt-3 flex list-disc flex-col gap-1 pl-6 text-ink-muted">
          <li>
            getting to a station by your mode. With Transit, that includes waiting for a local bus
            or train, and if walking is quicker, the trip may walk the whole way;
          </li>
          <li>riding the line, including the time spent standing at each station;</li>
          <li>getting away from the station you step off at, with the minutes left.</li>
        </ul>
        <p :class="PROSE_CLASS">
          By default, no wait to board the hypothetical line is added: it has no timetable, so a
          vehicle is assumed to be waiting when you reach the station. Where a line is set up with
          a wait, it is counted once, when you first board.
        </p>
      </section>

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          Where the numbers come from
        </h2>
        <p :class="PROSE_CLASS">
          Walking, biking and driving follow the streets and paths in <a
            :class="PROSE_LINK_CLASS"
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
          >OpenStreetMap</a>, routed by <a
            :class="PROSE_LINK_CLASS"
            href="https://github.com/valhalla/valhalla"
            target="_blank"
            rel="noopener noreferrer"
          >Valhalla</a>, an open-source routing engine.
        </p>
        <p :class="PROSE_CLASS">
          Local transit follows the published timetables of agencies in California and Nevada,
          gathered from the <a
            :class="PROSE_LINK_CLASS"
            href="https://mobilitydatabase.org"
            target="_blank"
            rel="noopener noreferrer"
          >Mobility Database</a> and other open-data publishers. A fresh set is gathered every week
          and switched in once it has been checked.
        </p>
        <p :class="PROSE_CLASS">
          The hypothetical line's own times are worked out from the route it is drawn along and the
          vehicles that run on it: the distance between stations, their top speed, how quickly they
          speed up and slow down, slower running through tight curves and down steep grades where
          the route records them, and how long they stand at each station.
        </p>
        <!-- A custom slot, so the link's text sits flush against the sentence
             around it without a stray underlined space. -->
        <p
          v-if="hasAttribution"
          :class="PROSE_CLASS"
          data-testid="how-it-works-attribution"
        >
          Every source is credited on the <RouterLink
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

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          What it doesn't model
        </h2>
        <ul class="font-body text-body mt-3 flex list-disc flex-col gap-1 pl-6 text-ink-muted">
          <li><strong class="text-ink">Fares.</strong> What a trip costs plays no part.</li>
          <li><strong class="text-ink">Crowding.</strong> There is always room on board.</li>
          <li>
            <strong class="text-ink">Weekends and evenings.</strong> Every splash zone starts on a
            weekday morning.
          </li>
          <li>
            <strong class="text-ink">Transfer penalties.</strong> Changing between lines of the
            network where they share a station adds no time.
          </li>
          <li>
            <strong class="text-ink">Delays.</strong> Local transit runs exactly as timetabled, with
            no live delays or cancellations.
          </li>
        </ul>
      </section>
    </article>
  </main>
</template>
