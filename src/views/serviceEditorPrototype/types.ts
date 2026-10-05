// PROTOTYPE (SPA-399): throwaway layout variants for the service editor.
// Lives on a throwaway branch; the winning layout gets rewritten into
// ServiceAuthoringView properly.

export type SectionKey = 'identity' | 'routeStops' | 'operations' | 'description'

export type SectionState = 'ready' | 'todo' | 'optional'

export interface EditorSection {
  key: SectionKey
  title: string
  state: SectionState
  hint: string
}

export type SaveTone = 'quiet' | 'dirty' | 'busy' | 'error'

export interface SaveStatus {
  label: string
  tone: SaveTone
  note: string | null
}

export const TONE_DOT_CLASS: Record<SaveTone, string> = {
  quiet: 'bg-ink-faint',
  dirty: 'bg-apricot',
  busy: 'bg-coral animate-pulse',
  error: 'bg-error',
}
