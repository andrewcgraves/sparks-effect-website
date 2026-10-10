export function railTilesUrl(
  raw: string | undefined = import.meta.env.VITE_RAIL_TILES_URL as string | undefined,
): string | null {
  const trimmed = raw?.trim()
  return trimmed ? trimmed : null
}
