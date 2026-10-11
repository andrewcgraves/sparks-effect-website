import type { BaseWrapper } from '@vue/test-utils'
import { visibleText } from './loading'

// Reads the stop list back as [from, to, run time] per hop, the way the card
// used to tabulate it, so view specs can assert on hops without the rail markup.
export function hopCells(wrapper: Pick<BaseWrapper<Node>, 'findAll'>): string[][] {
  const stops = wrapper
    .findAll('[data-testid="station-time-stop-name"]')
    .map((stop) => stop.text())
  return wrapper
    .findAll('[data-testid="station-time-hop"]')
    .map((hop, index) => [stops[index], stops[index + 1], visibleText(hop).trim()])
}
