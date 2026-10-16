# CONTEXT.md — the frontend's own vocabulary

Words that mean something specific in this repository and nowhere else.

Shared domain vocabulary — scenario, service, station, stop, node, edge, dwell,
boarding wait, mode vs costing, the error codes, the job statuses — is defined
once in
[**sparks-effect-api's `CONTEXT.md`**](https://github.com/andrewcgraves/sparks-effect-api/blob/main/CONTEXT.md).
Chain vocabulary — access leg, egress leg, journey, leg, reached vs reachable,
starter walk — is defined in
[**sparks-effect-routing-worker's `CONTEXT.md`**](https://github.com/andrewcgraves/sparks-effect-routing-worker/blob/main/CONTEXT.md),
and arrives here verbatim as the `metadata` block of a chain response
(`src/fixtures/isochrone.ts`). Read those first; this file only adds what is
local.

> Declaration-level comments were deliberately removed from the source in
> SPA-307. Domain meaning lives in these files; the *why* behind a decision lives
> in in-function comments and the README. Do not reintroduce comments that only
> repeat a declaration.

## Product vocabulary

Visitors and authors read product words; the code, URLs and API keep the
domain's. Use the product word in anything a person reads on the site: headings,
buttons, page titles, empty states, toasts, confirm dialogs, error messages. Use
the domain word for identifiers, test ids, router names and API fields. Code is
not renamed to match, and URLs are tidied separately (SPA-456).

| Product word | Domain word | Where it appears |
| --- | --- | --- |
| **Line** | service | Everywhere a person reads about one stopping pattern: the cover page, a published line's page, authoring ("My lines", "+ New line", "Line name", "Delete line"), publication status, admin's published list, and errors and confirmations about one |
| **Network** | scenario | A set of lines, curated or authored: the cover page, the network page, authoring ("My networks", "+ New network", "Network name"), the network builder's list of member lines, and errors and confirmations about one |
| **Route** | route | The geometry a line runs along. Seen mostly by authors — picking a route for a line, stops sitting on or off the route — though public route pages exist (`/routes/:slug`, in the sitemap and link previews). Never use it for a line or a network, and never say *alignment* or *track* in copy |
| **Splash zone** | isochrone | See [Splash zone](#splash-zone) |
| **Transfer** | handover | Moving a line to another author: "Transfer…" on a line's page, "Incoming transfers" and the "Transfer pending" badge on My authoring, and the confirms and toasts about one. The API reserves *transfer* for a rider changing service, but copy never uses it that way (a rider's change reads "Changed from"), so the product word is free. Code, test ids and API calls say *handover* |
| **Stop** | stop | A place *on a line*: what an author adds, names, orders and snaps ("Click the map to add a stop", "A line needs at least two stops"), a published line's Stops list, a dwell hint ("Longer than most stops"), and a count of a line's calls even where the places are stations (the Stations card's "3 stops · 1 h 11 min"). The API defines a stop as *a service calling at a place*, not a place; on the authored model each stop also carries its own name and coordinate, and that is what an author edits |
| **Station** | station / node | A place *a rider reaches*: rows of the time-remaining graph, the network page's Stations card, the map's station dots and hover, "Time between stations", "The nearest station is about …", the map key's "From station". Never "station stop" |
| **Travel time** | budget (`budget_mins`) | How long the visitor gives a plot: the form's "Travel time", "raise the travel time", the map key's "Travel time ran out here". *Budget* stays in code and in the worker's vocabulary |
| **Starting point** | origin | Where a plot starts: "Pick starting point on map", "Click the map to set the starting point", the time-remaining graph's top row, the map key's "From starting point". *Pin* only for the map marker itself; *origin* never in copy |
| **Saved splash zones** | prerendered isochrone | The ready-made plots a network page offers in its one plot panel, behind the "Saved splash zones" side of its switch ("Plot your own" is the other). Choosing one draws it and fills the form with its starting point, travel time and mode. Never *pre-rendered* or *curated* in copy |
| **Plot** | generate / enqueue | The one verb for making a splash zone: "Plot a splash zone", "Plot splash zone", "Plotting…" |
| **Build** | compile job / compiled graph | What compiling produces. *Compile* and *Recompile* stay as the author's actions ("Compiling this line…", "Recompile"); the result is "this line's latest build", never *compiled graph* |
| **Headway** / **every N min** | headway (`headway_s`), frequency window | Authors may read *headway* and *frequency window* on the authoring form ("Headway (min)", "Half the headway"). Anywhere else a gap between departures reads "every N min" |
| **Walk**, **Bike**, **Drive**, **Transit** | `walk`, `bike`, `drive`, `transit` | The travel-mode labels, held once in `MODE_LABELS` (`src/copy/modes.ts`) with the matching trip nouns ("bike ride", "transit trip"). Never the raw lowercase mode. A route's own mode (`rail`, `metro`, …) is a different thing, shown only to authors |
| **My authoring** | — | The signed-in author's page listing their lines, networks and incoming transfers (`/authoring`), and its breadcrumb |
| **Unnamed line** / **Unnamed stop** / **Unnamed station** / **Removed stop** | — | What a label says when the page has no name for the thing (`src/copy/names.ts`). *Removed stop* when the page knows the line and the line no longer has the stop (a declared interchange that outlived it); *Unnamed* when it has nothing to check against. Never the slug or id it was looked up by |

The words are kept apart because the API's two senses of *scenario* and
*service* (its `CONTEXT.md`, "The one that catches everyone") are a code
concern, and copy that mixed "route", "scenario" and "service" for the same thing
asked visitors to learn them. When a domain word appears in copy, it is a bug in
the copy, not in this table. Each noun maps to its word once, in
`AUTHORING_NOUN_WORDS` (`src/api/authoringFault.ts`); copy built from an
`AuthoringNoun` goes through that map rather than printing the noun.

The API's human-readable `message` is in its words, not these, so copy never
prints it: a fault is read by its `code` (and `detail`), mapped to a sentence
here, and the raw text goes to the console. A validation fault's field path is
named through `authoringFault.ts`'s field maps, and a spec walks every field of
`ServiceInput` and `ScenarioInput` to hold each one to a word.

*Line* also names a drawn stroke on the route map ("The three states of a line",
below). That is a word for developers about drawing, not copy.

## Splash zone

The product-facing name for an isochrone — the area reachable from a starting
point within a travel time. Used in every heading, button, map key and message a
person reads; the code, the API and the analytics events say *isochrone*.

## The phone map page

Below `md` (Tailwind's 48rem) a map page — the network page and a published
line's page — stops stacking a card map above its cards and becomes a **phone
map page** (`src/components/PhoneMapPage.vue`): the map on top, a **panel**
fixed to the bottom, and the panel's content behind **tabs**. Nothing is
dragged; a header button switches the panel between **tall** (room to read)
and **short** (room to aim), and arming tap-to-pick shortens it. The panel is
the page's one scroller: a card that caps and scrolls its own list elsewhere
lets the panel scroll it here (`PHONE_PANEL_SCROLLER`), so one swipe runs the
panel's whole length (SPA-508). Every phone
map page has a **Plot** tab (the splash-zone form and whatever plots with it)
and a **Results** tab (the time-remaining graph), disabled until a plot reaches
a station; the page adds its own after them — About on the network page, Stops
and About on a line's page, Interchanges where stops did not connect. The
network page calls its Results tab **Stations**: it holds the Stations card, the
timetable before a plot and the answer after it, so it is never disabled while
run times load. Plotting turns the panel to Results, and a plot that goes away
turns it back to Plot. Authoring pages are desktop
pages for launch and keep the stacked layout at any width.

## The Stations card

The network page's one card about stations (`src/components/StationsCard.vue`,
model in `stationsCard.ts`), in place of Time remaining and Time between
stations (SPA-504). One group per route, stops in **line order** before and
after a plot. Before a plot it is the timetable: run times between stops and a
direction toggle where a route runs at different times each way. After a plot
the order does not change; each stop gains its **time left** on arrival (the
number the map shows for that station, or "—"), and the rail is drawn as the map
draws a line — **ridden** in ink, **unridden** faint, **unfinished** dashed
with how far it got ("50% of 15:00"). A ridden hop shows the run time in the
direction ridden, marked ↑ or ↓. The stop boarded from the starting point reads
"Boarded here"; a change of train reads "Changed from"; a station on several
routes appears in each, with "Also on". With no run times to read a plot along,
the page falls back to the time-remaining graph. Line pages keep both cards.

## The time-remaining graph

`src/components/timeRemaining.ts` turns a chain response into a branching
diagram: one row per station, ordered by how much of the budget is left when a
rider departs it, with a gutter to the left drawing which branch came from
where. Four words carry the whole layout.

| Term | Definition |
| --- | --- |
| **View** | One tab of the graph, and one line's worth of the trip. Memberships are grouped by the service a station was *arrived on*, so each view shows a single line plus the station where it was boarded — the only row a view borrows, and never a destination of that view. On a curated network's page, services that share a route share a view, labelled with the route's short name (`shortLineName`, "Brightline West"), because that is what riders call the line. With no transit legs at all there is one view, keyed `access` and labelled by mode |
| **Row** | One station in one view. Row **content** — which service the rider leaves on, what they waited, whether they change — is computed once from the whole trip, so a station reads the same in every view it appears in. Only membership, parentage and lane geometry are per-view |
| **Lane** | A vertical column in the gutter. Lanes are assigned greedily as rows are walked and freed the moment their row is drawn, so a lane is reused down the page rather than reserved per branch. `laneCount` is the peak, and lane *width* shrinks to fit `GRAPH_COLUMN_PX` |
| **Through** | The lanes that pass a row without terminating at it — branches still pending further down. Drawn as vertical strokes beside the row |
| **Fork** | A lane leaving a row toward one of its children. The first child keeps the parent's lane (drawn straight on) and every other child takes a fresh one; child lists are sorted by time remaining, so the branch drawn straight on is the one with the most budget left after it |

Three related row facts, all per-view:

- **Flag** — the service a rider departs a row on. If they stay aboard what they
  arrived on, that; otherwise the first onward branch. On the starting point
  it is the mode the plot asked for, except that a transit access leg Valhalla
  walked the whole way (`access_rode_transit: false`) reads "Walk": when every
  access line in the view walked, the flag does; when they disagree, the flag
  stays the mode and each access line is prefixed with its own (SPA-336).
- **Transfer from** — set only when they do *not* stay aboard, naming the
  service they arrived on. This is the frontend's own presentation of a change of
  train; there is no transfer edge in the graph it is reading.
- **Access** — on the starting point only: the station or stations the
  view's own line was reached from, each with its access time. Several when the
  search boarded that line at more than one station; in the access view, the
  starter station alone. Never one name for the whole trip — a single station on
  the starting point of every tab read as the place the rider was being sent
  (SPA-342).

## The three states of a line

The route map draws one railway in three states, and nothing else on it carries
those weights:

| State | Drawn as | What it means |
| --- | --- | --- |
| **Ridden** | Ink | A leg the rider covered end to end. Read off the `legs` of every reachable station, so a hop early in a path is drawn once no matter how many stations sit downstream of it |
| **Unridden** | Faint grey | Every alignment on the map, under the ridden legs. Grey only once there *is* a plot to be unridden against — with no plot the network is drawn in ink, because the authoring and preview maps show no rider at all |
| **Unfinished** | Ink dashes, capped with a plain ink dot | An unfinished leg (below), the grey alignment showing through the gaps. The cap is where the budget ran out: a full stop on the dashes, not a station — every station dot on this map is ringed |

Every line is the same width; colour alone separates the states, so a corridor
does not change thickness at the station the rider got off at. The grey sits far
off the ink rather than a step down from it: the dashes of an unfinished leg are
read against it, and a near-ink grey leaves black dashes on a black line. The dashes carry
a gap several times their own length because MapLibre's round cap adds half a
width to each end of a dash: an even pattern closes up into a solid line at the
zoom a whole state is drawn at.

A ridden leg names two stations rather than a route and a chainage span the way
`trip_progress` does, so the frontend recovers the span: the alignment both
stations project closest to, cut between where each lands on it. A leg whose
stations sit further off every alignment than the authoring API's own off-route
threshold is not drawn.

## Progress

An **unfinished leg** is a hop the budget could not complete: the rider gets part
of the way along a corridor and stops. The worker reports these as
`trip_progress`, with a `fraction` of the ride covered; a row shows it as
"x% of the way to <station>". A progress entry is drawn in the view that owns
its service, so the same unfinished leg is not repeated across tabs.

## The three states of a publication

*Publish*, *publication* and *draft* are the API's words (ADR-0005 in
sparks-effect-api). The authoring page for a line reports one of three
states, never two:

| State | When | What it means |
| --- | --- | --- |
| **Unpublished** | No publication exists | Only the owner can see the line |
| **Published** | A publication exists, and the draft's `updated_at` is no later than its `published_at` | Visitors see the draft as it is now |
| **Unpublished changes** | A publication exists, and the draft has been edited since | Visitors still see the publication. A publication is a snapshot, so no edit — prose included — reaches the public page until the owner republishes |

Publishing never compiles; it pins the latest compile if that compile is still
current, and answers `stale_graph` if not. The page's answer to that is the one
it already gives the isochrone: compile through its own compile, then try
again, once.
