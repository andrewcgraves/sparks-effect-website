const SOLID_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) px-4 py-2.5 uppercase transition-colors duration-200 ease-(--ease-smooth) disabled:cursor-not-allowed disabled:opacity-50'

export const PRIMARY_BUTTON_CLASS =
  `${SOLID_BUTTON_CLASS} bg-coral text-white hover:bg-ink disabled:hover:bg-coral`

export const DESTRUCTIVE_BUTTON_CLASS =
  `${SOLID_BUTTON_CLASS} border border-coral bg-white text-error hover:bg-coral hover:text-white`

export const SECONDARY_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white disabled:cursor-not-allowed disabled:opacity-50'

export const TOGGLE_BUTTON_CLASS =
  `${SECONDARY_BUTTON_CLASS} aria-pressed:border-coral aria-pressed:bg-coral aria-pressed:text-white`
