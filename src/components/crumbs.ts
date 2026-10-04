export interface Crumb {
  label: string
  to?: string
}

export const AUTHORING_CRUMB: Crumb = { label: 'My authoring', to: '/authoring' }
