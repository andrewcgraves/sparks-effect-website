// Long enough for a slow phone on a poor connection to fetch the style, its
// sprite and glyphs and draw a first frame; short enough that a visitor whose
// network silently drops the tile host is not left watching a skeleton.
export const MAP_LOAD_TIMEOUT_MS = 20_000

export const PLOT_WITHOUT_MAP = 'You can still plot a splash zone and read the results.'
