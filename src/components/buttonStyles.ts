export const PRIMARY_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) bg-coral px-4 py-2.5 text-white uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-ink disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-coral'

export const SECONDARY_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) border border-border px-3 py-1.5 uppercase hover:bg-white disabled:cursor-not-allowed disabled:opacity-50'

export const TOGGLE_BUTTON_CLASS =
  `${SECONDARY_BUTTON_CLASS} aria-pressed:border-coral aria-pressed:bg-coral aria-pressed:text-white`

export const DESTRUCTIVE_BUTTON_CLASS =
  'font-display text-btn cursor-pointer rounded-(--radius-field) border border-coral bg-white px-4 py-2.5 text-coral uppercase transition-colors duration-200 ease-(--ease-smooth) hover:bg-coral hover:text-white disabled:cursor-not-allowed disabled:opacity-50'
