<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import AllLinesLink from '../components/AllLinesLink.vue'
import { INLINE_LINK_CLASS } from '../components/linkStyles'

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

const router = useRouter()

// The same rule as the footer: the attribution page is linked only once its
// route lands, so this page can ship ahead of it.
const hasAttribution = computed(() => router.getRoutes().some((route) => route.path === '/attribution'))

const SECTION_HEADING_CLASS = 'font-display text-h2 text-ink-true'
const PROSE_CLASS = 'font-body text-body mt-3 text-ink-muted'
const PROSE_LINK_CLASS = `${INLINE_LINK_CLASS} text-ink`
const LIST_CLASS = 'font-body text-body mt-3 flex list-disc flex-col gap-1 pl-6 text-ink-muted'
</script>

<template>
  <main class="flex-1 p-(--page-padding)">
    <div class="mb-8">
      <AllLinesLink />
    </div>

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
          A Transit trip leaves the starting point at 8 a.m. Pacific time on a weekday: today if
          today is a weekday, even once 8 a.m. has passed, otherwise the coming Monday. You can't
          pick another time. It answers “what does this network reach on a typical weekday
          morning?”, not “when should I leave?” Onward local transit runs to the timetable for when
          you would actually reach the station.
        </p>
        <p :class="PROSE_CLASS">
          Walk, Bike and Drive take the same time whatever the hour. Saved splash zones on a
          network's page keep the weekday they were plotted on, not today.
        </p>
      </section>

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          What the minutes include
        </h2>
        <p :class="PROSE_CLASS">
          The travel time is door to door: from leaving the starting point to arriving, counting
          minutes spent waiting for local transit as well as moving. A trip that rides the line
          counts:
        </p>
        <ul :class="LIST_CLASS">
          <li>
            getting to a station by your mode. With Transit, that includes waiting for a local bus
            or train. If walking is quicker, or nothing runs, the trip walks the whole way, and
            <em>Time remaining</em> says Walk;
          </li>
          <li>riding the line, including the time spent stopped at each station;</li>
          <li>heading out from the station you step off at, by the same mode, with the minutes left.</li>
        </ul>
        <p :class="PROSE_CLASS">
          By default, no wait to board the hypothetical line is added, since it has no timetable. If
          a line or network has a wait set, it is added once, when you first board.
        </p>
      </section>

      <section class="mt-12">
        <h2 :class="SECTION_HEADING_CLASS">
          Where the numbers come from
        </h2>
        <p :class="PROSE_CLASS">
          Walking, biking and driving follow the streets and paths of California and Nevada in <a
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
          Local transit follows the published timetables of most public agencies in California and
          Nevada, gathered from the <a
            :class="PROSE_LINK_CLASS"
            href="https://mobilitydatabase.org"
            target="_blank"
            rel="noopener noreferrer"
          >Mobility Database</a> and other open-data publishers. A new set is built every week but
          switched in by hand once checked, so the timetables in use can be a few weeks old.
        </p>
        <p :class="PROSE_CLASS">
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
        <ul :class="LIST_CLASS">
          <li><strong class="text-ink">Fares.</strong> What a trip costs plays no part.</li>
          <li><strong class="text-ink">Crowding.</strong> There is always room on board.</li>
          <li>
            <strong class="text-ink">How often the line runs.</strong> Unless a wait is set, a
            vehicle is always waiting.
          </li>
          <li>
            <strong class="text-ink">Weekends and evenings.</strong> Transit trips start on a weekday
            morning. A public holiday counts as a weekday, on that day's local timetable.
          </li>
          <li>
            <strong class="text-ink">Transfer penalties.</strong> Changing between the network's own
            lines at a shared station adds no time, even a short walk between platforms. Changes
            between local buses and trains include the wait.
          </li>
          <li>
            <strong class="text-ink">Parking and bikes on board.</strong> Drive assumes a car waits
            where you step off; Bike, that your bike rides the line with you.
          </li>
          <li><strong class="text-ink">Traffic.</strong> Driving assumes free-flowing roads at any hour.</li>
          <li>
            <strong class="text-ink">Delays.</strong> Local transit runs exactly to timetable.
          </li>
        </ul>
      </section>
    </article>
  </main>
</template>
