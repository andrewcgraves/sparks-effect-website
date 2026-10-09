// PROTOTYPE (SPA-414) — throwaway. A flat equirectangular projection, scaled
// by cos(latitude) so a state-sized extent keeps its shape; good enough for a
// thumbnail and a tile-free hero, nowhere near good enough for a real map.
import type { LngLat } from './homePrototypeData'

export interface Projector {
  width: number
  height: number
  project: (p: LngLat) => [number, number]
  path: (points: LngLat[], close?: boolean) => string
}

export function projector(points: LngLat[], width: number, height: number, pad = 12): Projector {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const midLat = points.reduce((sum, p) => sum + p[1], 0) / Math.max(points.length, 1)
  const k = Math.cos((midLat * Math.PI) / 180)
  for (const [lng, lat] of points) {
    minX = Math.min(minX, lng * k)
    maxX = Math.max(maxX, lng * k)
    minY = Math.min(minY, -lat)
    maxY = Math.max(maxY, -lat)
  }
  const spanX = Math.max(maxX - minX, 1e-6)
  const spanY = Math.max(maxY - minY, 1e-6)
  const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanY)
  const offX = (width - spanX * scale) / 2
  const offY = (height - spanY * scale) / 2

  const project = ([lng, lat]: LngLat): [number, number] => [
    offX + (lng * k - minX) * scale,
    offY + (-lat - minY) * scale,
  ]
  const path = (pts: LngLat[], close = false): string =>
    pts.map((p, i) => `${i ? 'L' : 'M'}${project(p).map((n) => n.toFixed(1)).join(',')}`).join('') + (close ? 'Z' : '')

  return { width, height, project, path }
}
