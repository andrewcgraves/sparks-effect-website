import { resolveTilePreconnectOrigin, styleUrlForKey } from './tileHost'

export { resolveTilePreconnectOrigin }

export interface TileCredit {
  name: string
  href: string
}

const OPENFREEMAP_CREDIT: TileCredit = { name: 'OpenFreeMap', href: 'https://openfreemap.org' }
const STADIA_CREDIT: TileCredit = { name: 'Stadia Maps', href: 'https://stadiamaps.com' }

function nonBlankKey(apiKey: string | undefined): string | undefined {
  return apiKey?.trim() || undefined
}

export function resolveMapStyleUrl(
  apiKey: string | undefined = import.meta.env.VITE_STADIA_API_KEY as string | undefined,
): string {
  return styleUrlForKey(apiKey)
}

export function resolveTileCredit(
  apiKey: string | undefined = import.meta.env.VITE_STADIA_API_KEY as string | undefined,
): TileCredit {
  return nonBlankKey(apiKey) ? STADIA_CREDIT : OPENFREEMAP_CREDIT
}
