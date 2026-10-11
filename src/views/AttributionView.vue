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
import { CONTACT_EMAIL, CONTACT_MAILTO, SOURCE_URL } from '../legal/contact'
import { resolveTileCredit } from '../mapStyle'

const UPDATED = '2026-10-10'

const tileCredit = resolveTileCredit()

const ODBL = 'https://opendatacommons.org/licenses/odbl/1-0/'
const ODC_BY = 'https://opendatacommons.org/licenses/by/1-0/'
const CC_BY_4 = 'https://creativecommons.org/licenses/by/4.0/'
const CC_BY_3 = 'https://creativecommons.org/licenses/by/3.0/'

interface Feed {
  name: string
  href: string
}

// Gives each name what follows it in a sentence, "A, B, C and D" or "A, B, C",
// so the template needs no inline conditionals between links.
function inProse(feeds: Feed[], beforeLast: ' and ' | ', '): Array<Feed & { after: string }> {
  return feeds.map((feed, index) => ({
    ...feed,
    after: index === feeds.length - 1 ? '' : index === feeds.length - 2 ? beforeLast : ', ',
  }))
}

// Feeds published under the ODC Attribution License, whose §4.3 asks for the
// database's name and a link to where it lives.
const ODC_BY_FEEDS = inProse([
  { name: 'San Francisco Bay Ferry', href: 'https://gtfs.sanfranciscobayferry.com/gtfs.zip' },
  { name: 'MVgo', href: 'https://gtfs.mvgo.org/gtfs.zip' },
  { name: 'Mountain View Community Shuttle', href: 'https://gtfs.mvcommunityshuttle.com/gtfs.zip' },
  { name: 'El Monte Transit', href: 'http://data.trilliumtransit.com/gtfs/elmonte-ca-us/elmonte-ca-us.zip' },
], ' and ')

const CC_BY_4_FEEDS = inProse([
  { name: 'Nevada County Connects (Gold Country Stage)', href: 'http://data.trilliumtransit.com/gtfs/goldcountrystage-ca-us/goldcountrystage-ca-us.zip' },
  { name: 'Bellflower Bus', href: 'https://gtfs.remix.com/CalITP.zip' },
  { name: 'The Santa Cruzer', href: 'https://www.pinpointavl.com/santacruzer.zip' },
], ', ')
</script>

<!-- The wording below is what SPA-419 found each licence to require. Change a
     credit only with that ticket's table open. -->
<template>
  <ProsePage
    title="Attribution"
    :updated="UPDATED"
  >
    <p :class="PROSE_LEAD_CLASS">
      Sparks Effect is built on the open data below. None of these organisations endorses it.
    </p>

    <h2
      id="map"
      :class="PROSE_H2_CLASS"
    >
      Map
    </h2>
    <p :class="PROSE_P_CLASS">
      Map data © <ExternalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</ExternalLink>,
      available under the <ExternalLink :href="ODBL">Open Database License (ODbL)</ExternalLink>.
      Tiles by <ExternalLink
        :href="tileCredit.href"
        data-testid="tile-credit"
      >{{ tileCredit.name }}</ExternalLink>, using the
      <ExternalLink href="https://openmaptiles.org/">OpenMapTiles</ExternalLink> schema, © OpenMapTiles
      (<ExternalLink :href="CC_BY_4">CC BY 4.0</ExternalLink>). Style: Positron, © MapTiler &amp;
      OpenMapTiles contributors (<ExternalLink :href="CC_BY_4">CC BY 4.0</ExternalLink>), derived from
      <ExternalLink href="https://github.com/CartoDB/CartoDB-basemaps">CARTO Basemaps</ExternalLink> by
      Stamen and Paul Norman for CARTO (<ExternalLink :href="CC_BY_3">CC BY 3.0</ExternalLink>).
    </p>

    <h2
      id="routing-graph"
      :class="PROSE_H2_CLASS"
    >
      Street network
    </h2>
    <p :class="PROSE_P_CLASS">
      Splash zones are computed over a Derivative Database of OpenStreetMap, licensed under the
      <ExternalLink :href="ODBL">ODbL</ExternalLink>, with time zones from
      <ExternalLink href="https://github.com/evansiroky/timezone-boundary-builder">timezone-boundary-builder</ExternalLink>
      (ODbL). How it is built is available free on request from
      <a
        :href="CONTACT_MAILTO"
        :class="PROSE_LINK_CLASS"
      >{{ CONTACT_EMAIL }}</a>.
    </p>

    <h2
      id="transit-schedules"
      :class="PROSE_H2_CLASS"
    >
      Transit schedules
    </h2>
    <p :class="PROSE_P_CLASS">
      We convert each feed into a routing graph, and fill in calendars listed date by date. These
      are changes to the original data. Sparks Effect is not affiliated with or endorsed by any
      transit agency.
    </p>
    <ul :class="PROSE_LIST_CLASS">
      <li>
        Contains information from the GTFS feeds of
        <span
          v-for="feed in ODC_BY_FEEDS"
          :key="feed.name"
        ><ExternalLink :href="feed.href">{{ feed.name }}</ExternalLink>{{ feed.after }}</span>, which are made available under the
        <ExternalLink :href="ODC_BY">ODC Attribution License</ExternalLink>.
      </li>
      <li>
        <span
          v-for="feed in CC_BY_4_FEEDS"
          :key="feed.name"
        ><ExternalLink :href="feed.href">{{ feed.name }}</ExternalLink>{{ feed.after }}</span>:
        <ExternalLink :href="CC_BY_4">CC BY 4.0</ExternalLink>.
        <ExternalLink href="http://data.trilliumtransit.com/gtfs/victorville-ca-us/victorville-ca-us.zip">Victor Valley Transit Authority</ExternalLink>:
        <ExternalLink :href="CC_BY_3">CC BY 3.0</ExternalLink>.
      </li>
      <li>
        <ExternalLink
          href="https://www.511.org"
          data-testid="attribution-511"
        >Data provided by 511.org</ExternalLink>.
      </li>
      <li>
        <ExternalLink href="https://github.com/PinpointAVL/TAPS-GTFS">UCSC Transportation and Parking Services</ExternalLink>:
        data © 2025 PinpointAVL,
        <ExternalLink href="https://github.com/PinpointAVL/TAPS-GTFS/blob/main/LICENSE">MIT License</ExternalLink>.
      </li>
      <li>
        <ExternalLink href="https://developer.scmetro.org/">Santa Cruz METRO</ExternalLink>:
        <ExternalLink :href="CC_BY_4">CC BY 4.0</ExternalLink>, under the SCMTD Developer License Agreement.
      </li>
      <li>
        LAVTA (Wheels): visit <ExternalLink href="https://www.wheelsbus.com/">wheelsbus.com</ExternalLink> for more information.
      </li>
      <li>Schedule data provided by LA Metro.</li>
      <li>Route and schedule data provided by permission of San Joaquin RTD.</li>
    </ul>

    <h2
      id="address-search"
      :class="PROSE_H2_CLASS"
    >
      Address search
    </h2>
    <p :class="PROSE_P_CLASS">
      Address search © <ExternalLink href="https://stadiamaps.com/">Stadia Maps</ExternalLink>
      (<ExternalLink href="https://stadiamaps.com/attribution/">sources</ExternalLink>) ·
      © <ExternalLink href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</ExternalLink> ·
      <ExternalLink href="https://openaddresses.io/">OpenAddresses</ExternalLink> ·
      <ExternalLink href="https://www.geonames.org/">GeoNames</ExternalLink>
      (<ExternalLink :href="CC_BY_4">CC BY 4.0</ExternalLink>) ·
      Data from <ExternalLink href="https://whosonfirst.org/">Who's On First</ExternalLink>
      (<ExternalLink href="https://whosonfirst.org/docs/licenses/">License</ExternalLink>) ·
      <ExternalLink href="https://opensource.foursquare.com/os-places/">Foursquare OS Places</ExternalLink>
      (Apache 2.0, © 2024 Foursquare Labs, Inc.).
    </p>

    <h2
      id="proposed-lines"
      :class="PROSE_H2_CLASS"
    >
      Proposed lines
    </h2>
    <p :class="PROSE_P_CLASS">
      California High-Speed Rail is based on the California High-Speed Rail Authority's preliminary
      planning data, which is subject to change. Brightline West is traced from OpenStreetMap (ODbL)
      and the High Desert Corridor JPA's corridor maps.
    </p>

    <h2
      id="software"
      :class="PROSE_H2_CLASS"
    >
      Software
    </h2>
    <p :class="PROSE_P_CLASS">
      The map is drawn with <ExternalLink href="https://maplibre.org/">MapLibre GL JS</ExternalLink>
      (BSD-3-Clause), in Inter and Open Sans
      (<ExternalLink href="https://openfontlicense.org/">SIL Open Font License 1.1</ExternalLink>).
      Every other dependency and its licence is in the
      <ExternalLink :href="SOURCE_URL">source code</ExternalLink>.
    </p>
  </ProsePage>
</template>
