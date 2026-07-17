/* Positron, not Liberty: Liberty paints water #a0c8f0, a saturated blue that
   swallows the origin fill at 0.35 opacity — most of the CA-HSR coastline.
   Positron's water is desaturated and its background matches --color-surface. */
const OPENFREEMAP_POSITRON = 'https://tiles.openfreemap.org/styles/positron'
const STADIA_ALIDADE_SMOOTH = 'https://tiles.stadiamaps.com/styles/alidade_smooth.json'

export function resolveMapStyleUrl(
  apiKey: string | undefined = import.meta.env.VITE_STADIA_API_KEY as string | undefined,
): string {
  const key = apiKey?.trim()
  if (key) {
    return `${STADIA_ALIDADE_SMOOTH}?api_key=${encodeURIComponent(key)}`
  }
  return OPENFREEMAP_POSITRON
}
