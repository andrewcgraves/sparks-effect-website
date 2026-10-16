/// <reference types="node" />
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

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
