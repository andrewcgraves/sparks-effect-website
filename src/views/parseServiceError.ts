// Picks the offending stop name(s) out of a 422 rejection from
// POST/PUT /api/services, so the form can flag the specific stop row rather
// than only showing the raw message in a banner.
//
// The two shapes come straight from internal/transit/snap.go on the API:
//   - off-route:    `stop %q is %s from route %q`               (1 stop name)
//   - order fault:  `stop %q (seq %d) lies %s %q (seq %d) ...`   (2 stop names)
// Matched positionally rather than "every quoted string", since the off-route
// message also quotes the route slug, which is not a stop.
export function extractOffendingStopNames(message: string): string[] {
  const orderFault = message.match(/stop "([^"]+)" \(seq \d+\) lies (?:before|after) "([^"]+)" \(seq \d+\)/)
  if (orderFault) return [orderFault[1], orderFault[2]]

  const offRoute = message.match(/stop "([^"]+)" is [^"]+ from route "/)
  if (offRoute) return [offRoute[1]]

  return []
}
