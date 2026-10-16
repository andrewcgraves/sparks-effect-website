const SOLID_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) px-4 py-2.5 uppercase transition-colors duration-200 ease-(--ease-smooth) disabled:cursor-not-allowed disabled:opacity-50'

export const SELECTED_CHOICE_CLASS = 'border-coral bg-coral/10 text-ink'

export const PRESSED_CHOICE_CLASS = 'aria-pressed:border-coral aria-pressed:bg-coral/10 aria-pressed:text-ink'

export const PRIMARY_BUTTON_CLASS =
  `${SOLID_BUTTON_CLASS} bg-ink text-white hover:bg-ink-muted disabled:hover:bg-ink`

export const DESTRUCTIVE_BUTTON_CLASS =
  `${SOLID_BUTTON_CLASS} border border-coral bg-white text-error hover:bg-error hover:text-white`

export const SECONDARY_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white disabled:cursor-not-allowed disabled:opacity-50'

export const PLACEMENT_TOGGLE_CLASS =
  `font-display text-btn w-full cursor-pointer rounded-(--radius-field) border border-dashed border-ink-muted px-4 py-2.5 text-ink uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-white aria-pressed:border-solid ${PRESSED_CHOICE_CLASS} disabled:cursor-not-allowed disabled:opacity-50`

export const TOGGLE_BUTTON_CLASS =
  `${SECONDARY_BUTTON_CLASS} ${PRESSED_CHOICE_CLASS}`
