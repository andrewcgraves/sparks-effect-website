const OPENFREEMAP_LIBERTY = 'https://tiles.openfreemap.org/styles/liberty'
const STADIA_ALIDADE_SMOOTH = 'https://tiles.stadiamaps.com/styles/alidade_smooth.json'

export function resolveMapStyleUrl(
  apiKey: string | undefined = import.meta.env.VITE_STADIA_API_KEY as string | undefined,
): string {
  const key = apiKey?.trim()
  if (key) {
    return `${STADIA_ALIDADE_SMOOTH}?api_key=${encodeURIComponent(key)}`
  }
  return OPENFREEMAP_LIBERTY
}
