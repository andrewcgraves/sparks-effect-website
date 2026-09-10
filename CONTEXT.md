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

Two related row facts, both per-view:

- **Flag** — the service a rider departs a row on. If they stay aboard what they
  arrived on, that; otherwise the first onward branch.
- **Transfer from** — set only when they do *not* stay aboard, naming the
  service they arrived on. This is the frontend's own presentation of a change of
  train; there is no transfer edge in the graph it is reading.

## Progress

An **unfinished leg** is a hop the budget could not complete: the rider gets part
of the way along a corridor and stops. The worker reports these as
`trip_progress`, with a `fraction` of the ride covered; a row shows it as
"x% of the way to <station>". A progress entry is drawn in the view that owns
its service, so the same unfinished leg is not repeated across tabs.
