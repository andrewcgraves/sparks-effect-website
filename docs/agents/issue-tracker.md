# Issue tracker: Linear

Issues for this repo live as Linear issues. Use the Linear MCP for all actions.

- **Workspace team**: `Sparks Effect`
- **Issue prefix**: `SPA-` (e.g. `SPA-84`)
- **Repo**: `andrewcgraves/sparks-effect-website`

Commits and PR titles reference the Linear issue by its identifier, e.g.
`SPA-84: add authoring API client, domain types, and job-polling helper`.

## When a skill says "publish to the issue tracker"

Create an issue in the `Sparks Effect` team using `Linear:save_issue`.

## When a skill says "fetch the relevant ticket"

Fetch the ticket using `Linear:get_issue` (by `SPA-` identifier), or
`Linear:list_issues` scoped to the `Sparks Effect` team when searching.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a single issue with **child** issues as tickets.

- **Map**: a single issue labelled `wayfinder:map`, holding the Notes / Decisions-so-far / Fog body. `Linear:save_issue`
- **Child ticket**: an issue linked to the map as a Linear sub-issue. Labels: `wayfinder:<type>` (`research`/`prototype`/`grilling`/`task`). Once claimed, the ticket is assigned to the driving dev.
- **Blocking**: Linear's **native issue dependencies** — the canonical, UI-visible representation. Where dependencies aren't available, fall back to a `Blocked by: SPA-<n>, SPA-<n>` line at the top of the child body. A ticket is unblocked when every blocker is closed.
- **Frontier query**: list the map's open children, drop any with an open blocker (`issue_dependencies_summary.blocked_by > 0`, or an open issue in the `Blocked by` line) or an assignee; first in map order wins.
- **Claim**: `Linear:save_issue({id: "SPA-XXX", assignee: "<REPLACE WITH ME>"})` — the session's first write.
- **Resolve**: `Linear:save_comment`, then `Linear:save_issue` setting the state to `Done`, then append a context pointer (gist + link) to the map's Decisions-so-far.
