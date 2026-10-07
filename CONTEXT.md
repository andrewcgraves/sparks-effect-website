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
| **Route** | route | The geometry a line runs along. Only authors see it: picking a route for a line, stops sitting on or off the route, the route page. Never use it for a line or a network, and never say *alignment* or *track* in copy |
| **Splash zone** | isochrone | See [Splash zone](#splash-zone) |

The words are kept apart because the API's two senses of *scenario* and
*service* (its `CONTEXT.md`, "The one that catches everyone") are a code
concern, and copy that mixed "route", "scenario" and "service" for the same thing
asked visitors to learn them. When a domain word appears in copy, it is a bug in
the copy, not in this table. Each noun maps to its word once, in
`AUTHORING_NOUN_WORDS` (`src/api/authoringFault.ts`); copy built from an
`AuthoringNoun` goes through that map rather than printing the noun.

*Line* also names a drawn stroke on the route map ("The three states of a line",
below). That is a word for developers about drawing, not copy.

## Splash zone

The product-facing name for an isochrone — the area reachable from a point
within a time budget. Used on the cover page and in copy aimed at readers; the
code says *isochrone*.

## The time-remaining graph

`src/components/timeRemaining.ts` turns a chain response into a branching
diagram: one row per station, ordered by how much of the budget is left when a
rider departs it, with a gutter to the left drawing which branch came from
where. Four words carry the whole layout.

| Term | Definition |
| --- | --- |
| **View** | One tab of the graph, and one line's worth of the trip. Memberships are grouped by the service a station was *arrived on*, so each view shows a single line plus the station where it was boarded — the only row a view borrows, and never a destination of that view. With no transit legs at all there is one view, keyed `access` and labelled by mode |
| **Row** | One station in one view. Row **content** — which service the rider leaves on, what they waited, whether they change — is computed once from the whole trip, so a station reads the same in every view it appears in. Only membership, parentage and lane geometry are per-view |
| **Lane** | A vertical column in the gutter. Lanes are assigned greedily as rows are walked and freed the moment their row is drawn, so a lane is reused down the page rather than reserved per branch. `laneCount` is the peak, and lane *width* shrinks to fit `GRAPH_COLUMN_PX` |
| **Through** | The lanes that pass a row without terminating at it — branches still pending further down. Drawn as vertical strokes beside the row |
| **Fork** | A lane leaving a row toward one of its children. The first child keeps the parent's lane (drawn straight on) and every other child takes a fresh one; child lists are sorted by time remaining, so the branch drawn straight on is the one with the most budget left after it |

Three related row facts, all per-view:

- **Flag** — the service a rider departs a row on. If they stay aboard what they
  arrived on, that; otherwise the first onward branch. On the starting location
  it is the mode the plot asked for, except that a transit access leg Valhalla
  walked the whole way (`access_rode_transit: false`) reads "Walk": when every
  access line in the view walked, the flag does; when they disagree, the flag
  stays the mode and each access line is prefixed with its own (SPA-336).
- **Transfer from** — set only when they do *not* stay aboard, naming the
  service they arrived on. This is the frontend's own presentation of a change of
  train; there is no transfer edge in the graph it is reading.
- **Access** — on the starting location only: the station or stations the
  view's own line was reached from, each with its access time. Several when the
  search boarded that line at more than one station; in the access view, the
  starter station alone. Never one name for the whole trip — a single station on
  the starting location of every tab read as the place the rider was being sent
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
sparks-effect-api). The authoring page for a service reports one of three
states, never two:

| State | When | What it means |
| --- | --- | --- |
| **Unpublished** | No publication exists | Only the owner can see the service |
| **Published** | A publication exists, and the draft's `updated_at` is no later than its `published_at` | Visitors see the draft as it is now |
| **Unpublished changes** | A publication exists, and the draft has been edited since | Visitors still see the publication. A publication is a snapshot, so no edit — prose included — reaches the public page until the owner republishes |

Publishing never compiles; it pins the latest compile if that compile is still
current, and answers `stale_graph` if not. The page's answer to that is the one
it already gives the isochrone: compile through its own compile, then try
again, once.
