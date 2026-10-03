const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron'
const STADIA_ALIDADE_SMOOTH = 'https://tiles.stadiamaps.com/styles/alidade_smooth.json'

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
  const key = nonBlankKey(apiKey)
  if (key) {
    return `${STADIA_ALIDADE_SMOOTH}?api_key=${encodeURIComponent(key)}`
  }
  return OPENFREEMAP_POSITRON
}

export function resolveTileCredit(
  apiKey: string | undefined = import.meta.env.VITE_STADIA_API_KEY as string | undefined,
): TileCredit {
  return nonBlankKey(apiKey) ? STADIA_CREDIT : OPENFREEMAP_CREDIT
}
