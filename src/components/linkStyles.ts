export const ACTION_LINK_BASE_CLASS =
  'font-display text-btn cursor-pointer text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral'

export const HIT_AREA_CLASS = 'pointer-coarse:min-h-11 pointer-coarse:py-3 pointer-coarse:-my-3'

export const ACTION_LINK_CLASS = `${ACTION_LINK_BASE_CLASS} ${HIT_AREA_CLASS}`

export const LIST_CARD_FRAME_CLASS =
  'font-body text-body flex flex-col gap-1 rounded-(--radius-field) border border-border px-3 py-2'

export const LIST_CARD_LINK_CLASS =
  `${LIST_CARD_FRAME_CLASS} bg-surface text-ink transition-colors duration-200 ease-(--ease-smooth) hover:border-coral`

export const INLINE_LINK_CLASS =
  'underline transition-colors duration-200 ease-(--ease-smooth) hover:text-coral'
