/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

const SRC = resolve(process.cwd(), 'src')

const sourceFiles = readdirSync(SRC, { recursive: true, encoding: 'utf8' })
  .filter((path) => /\.(vue|ts)$/.test(path) && !path.endsWith('.spec.ts'))
  .map((path) => ({ path, text: readFileSync(join(SRC, path), 'utf8') }))

function filesUsing(className: string): string[] {
  return sourceFiles.filter(({ text }) => text.includes(className)).map(({ path }) => path)
}

describe('design scheme', () => {
  it('scans the real source rather than silently matching nothing', () => {
    expect(sourceFiles.map(({ path }) => path)).toContain(join('components', 'linkStyles.ts'))
  })

  // Coral means selected, focus and primary; hover is ink (SPA-519). Joined
  // so `grep -rn` for the class finds no hit in this file.
  it('never turns text coral on hover', () => {
    expect(filesUsing(['hover', 'text-coral'].join(':'))).toEqual([])
  })
})

// A ratchet on type and surface styles that bypass theme.css. Counts may only
// fall: a file that gains one fails, and a file that loses one fails until its
// baseline is lowered to match, so the baseline never leaves room for new drift.
const PATTERNS = {
  arbitraryText: /\btext-\[[^\]\s]*\]/g,
  arbitraryRadius: /\brounded(?:-[a-z]+)?-\[[^\]\s]*\]/g,
  arbitraryShadow: /\bshadow-\[[^\]\s]*\]/g,
  offScaleWeight: /\bfont-(?:medium|semibold)\b/g,
  hexColour: /(?<![&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g,
  rawSmallText: /(?<![-\w])text-(?:micro|caption)\b/g,
} as const

type PatternName = keyof typeof PATTERNS
type Counts = Partial<Record<PatternName, number>>

const RATCHET_EXCLUDED = new Set(['src/themeTokens.ts'])

const BASELINE: Record<string, Counts> = {
  'src/IsochroneForm.vue': { arbitraryText: 1, rawSmallText: 4 },
  'src/components/AccountMenu.vue': { rawSmallText: 1 },
  'src/components/AddressAutocomplete.vue': { arbitraryText: 1, rawSmallText: 3 },
  'src/components/AdminPeople.vue': { rawSmallText: 9 },
  'src/components/AdminPublished.vue': { rawSmallText: 5 },
  'src/components/ConfirmDialog.vue': { rawSmallText: 1 },
  'src/components/CopyLinkField.vue': { rawSmallText: 1 },
  'src/components/DeclaredInterchanges.vue': { rawSmallText: 2 },
  'src/components/FieldNote.vue': { rawSmallText: 2 },
  'src/components/FieldSkeleton.vue': { arbitraryText: 1, rawSmallText: 1 },
  'src/components/InterchangeReport.vue': { rawSmallText: 2 },
  'src/components/KeySwatch.vue': { arbitraryRadius: 1, hexColour: 1 },
  'src/components/ListSkeleton.vue': { rawSmallText: 1 },
  'src/components/MapTour.vue': { rawSmallText: 1 },
  'src/components/MapView.vue': { arbitraryText: 2, rawSmallText: 3 },
  'src/components/PageSkeleton.vue': { rawSmallText: 1 },
  'src/components/PhoneMapPage.vue': { arbitraryText: 2 },
  'src/components/PrerenderedIsochrones.vue': { arbitraryText: 1, rawSmallText: 2 },
  'src/components/ProsePage.vue': { rawSmallText: 1 },
  'src/components/PublicationControl.vue': { rawSmallText: 6 },
  'src/components/RoutingStatusBanner.vue': { rawSmallText: 1 },
  'src/components/ScenarioPreviewPanel.vue': { rawSmallText: 2 },
  'src/components/SegmentedControl.vue': { rawSmallText: 1 },
  'src/components/ServiceStops.vue': { rawSmallText: 1 },
  'src/components/SiteFooter.vue': { rawSmallText: 1 },
  'src/components/SiteHeader.vue': { arbitraryText: 1, rawSmallText: 1 },
  'src/components/SkeletonShape.vue': { rawSmallText: 1 },
  'src/components/StationDetail.vue': { rawSmallText: 1 },
  'src/components/StationsCard.vue': { rawSmallText: 9 },
  'src/components/StopActionsMenu.vue': { rawSmallText: 1 },
  'src/components/TimeBetweenStations.vue': { rawSmallText: 5 },
  'src/components/TimeRemaining.vue': { rawSmallText: 4 },
  'src/components/ToastRegion.vue': { rawSmallText: 1 },
  'src/components/fieldStyles.ts': { arbitraryText: 1, rawSmallText: 1 },
  'src/components/tooltip.ts': { rawSmallText: 3 },
  'src/composables/useRouteLayer.ts': { hexColour: 1 },
  'src/composables/useStopPreviewLayer.ts': { hexColour: 2 },
  'src/views/AccountView.vue': { rawSmallText: 6 },
  'src/views/AuthoredScenarioView.vue': { rawSmallText: 5 },
  'src/views/AuthoredServiceView.vue': { rawSmallText: 11 },
  'src/views/AuthoringView.vue': { rawSmallText: 10 },
  'src/views/CoverPage.vue': { rawSmallText: 4 },
  'src/views/LoginView.vue': { rawSmallText: 3 },
  'src/views/PublishedServiceView.vue': { rawSmallText: 2 },
  'src/views/RouteView.vue': { rawSmallText: 1 },
  'src/views/ScenarioBuilderView.vue': { rawSmallText: 8 },
  'src/views/ScenarioView.vue': { rawSmallText: 2 },
  'src/views/ServiceAuthoringView.vue': { arbitraryShadow: 3, offScaleWeight: 1, rawSmallText: 14 },
  'src/views/WelcomeView.vue': { rawSmallText: 5 },
}

function countsIn(source: string): Counts {
  const counts: Counts = {}
  for (const [name, pattern] of Object.entries(PATTERNS) as [PatternName, RegExp][]) {
    const found = source.match(pattern)?.length ?? 0
    if (found > 0) counts[name] = found
  }
  return counts
}

const ratchetedFiles = sourceFiles
  .map(({ path, text }) => ({ path: `src/${path.split(sep).join('/')}`, text }))
  .filter(({ path }) => !RATCHET_EXCLUDED.has(path))

const current: Record<string, Counts> = Object.fromEntries(
  ratchetedFiles
    .map(({ path, text }) => [path, countsIn(text)] as const)
    .filter(([, counts]) => Object.keys(counts).length > 0),
)

describe('design scheme ratchet', () => {
  it('leaves themeTokens.ts, which mirrors theme.css values, out of the ratchet', () => {
    expect(ratchetedFiles.map(({ path }) => path)).toContain('src/components/fieldStyles.ts')
    expect(ratchetedFiles.map(({ path }) => path)).not.toContain('src/themeTokens.ts')
  })

  it.each(Object.keys(PATTERNS) as PatternName[])('%s matches what it should and nothing else', (name) => {
    const samples: Record<PatternName, [string, string]> = {
      arbitraryText: ['class="text-[13px]"', 'class="text-caption text-ink"'],
      arbitraryRadius: ['class="rounded-t-[3px]"', 'class="rounded-(--radius-field)"'],
      arbitraryShadow: ['class="shadow-[0_1px_2px_black]"', 'class="shadow-panel"'],
      offScaleWeight: ['class="font-semibold"', 'class="font-bold"'],
      hexColour: ["color: '#c2453b'", 'href="#main" &#8212;'],
      rawSmallText: ['class="text-micro uppercase"', 'class="t-meta" var(--text-caption)'],
    }
    const [hit, miss] = samples[name]
    expect(countsIn(hit)[name]).toBe(1)
    expect(countsIn(miss)[name]).toBeUndefined()
  })

  it('finds no off-scale style in a file the baseline does not list', () => {
    const unlisted = Object.keys(current).filter((path) => !(path in BASELINE))
    expect(unlisted, 'use a theme.css token or t-* role instead of a raw style').toEqual([])
  })

  it.each(Object.keys(BASELINE))('%s holds at its baseline', (path) => {
    const now = current[path] ?? {}
    for (const name of Object.keys(PATTERNS) as PatternName[]) {
      const allowed = BASELINE[path][name] ?? 0
      const found = now[name] ?? 0
      expect(
        found,
        found > allowed
          ? `${path} gained a ${name} style; use a theme.css token or t-* role instead`
          : `${path} dropped to ${found} ${name}; lower its baseline in designScheme.spec.ts to ${found}`,
      ).toBe(allowed)
    }
  })
})
