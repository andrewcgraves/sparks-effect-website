/* One home for the link utility lists shared across the authoring pages, for the
   same reason as fieldStyles: utilities and design tokens only, no @apply. */

/* Standalone actions — sign out, "+ New service", the back link on a detail page. */
export const ACTION_LINK_CLASS =
  'font-display text-btn cursor-pointer text-ink-muted uppercase transition-colors duration-200 ease-(--ease-smooth) hover:text-coral'

/* A record in one of the "My authoring" lists, stacking name over slug. */
export const LIST_CARD_LINK_CLASS =
  'font-body text-body flex flex-col gap-1 rounded-(--radius-field) border border-border bg-surface px-3 py-2 text-ink transition-colors duration-200 ease-(--ease-smooth) hover:border-coral'
