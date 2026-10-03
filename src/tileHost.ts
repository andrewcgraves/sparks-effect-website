const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron'
const STADIA_ALIDADE_SMOOTH = 'https://tiles.stadiamaps.com/styles/alidade_smooth.json'

function nonBlankKey(apiKey: string | undefined): string | undefined {
  return apiKey?.trim() || undefined
}

export function styleUrlForKey(apiKey: string | undefined): string {
  const key = nonBlankKey(apiKey)
  if (key) {
    return `${STADIA_ALIDADE_SMOOTH}?api_key=${encodeURIComponent(key)}`
  }
  return OPENFREEMAP_POSITRON
}

export function resolveTilePreconnectOrigin(apiKey: string | undefined): string {
  return new URL(styleUrlForKey(apiKey)).origin
}
