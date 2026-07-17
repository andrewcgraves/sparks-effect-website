/* One home for the form-field utility lists, which are otherwise repeated across
   every field in IsochroneForm and AddressAutocomplete. This project styles with
   utilities and design tokens only, and does not use @apply, so these stay utility
   strings rather than becoming a CSS class. Tailwind scans .ts sources, so the
   utilities named here are still generated. */

export const FIELD_LABEL_CLASS =
  'font-body text-micro flex flex-col gap-1 text-ink-muted italic uppercase'

/* Fields sit inside an italic uppercase label, hence the not-italic/normal-case reset. */
export const FIELD_INPUT_CLASS =
  'font-body rounded-(--radius-field) border border-border bg-white px-2 py-1.5 text-[14px] text-ink not-italic normal-case'
