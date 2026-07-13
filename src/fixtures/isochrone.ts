import type { FeatureCollection, Polygon } from 'geojson'

export interface IsochroneProperties {
  contour: number
  color: string
  opacity: number
  fill: string
  fillOpacity: number
}

export const isochroneGeoJSON: FeatureCollection<Polygon, IsochroneProperties> = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        contour: 15,
        color: '#bf4040',
        opacity: 0.33,
        fill: '#bf4040',
        fillOpacity: 0.33,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4444, 37.794],
            [-122.4444, 37.7548],
            [-122.3944, 37.7548],
            [-122.3944, 37.794],
            [-122.4444, 37.794],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        contour: 10,
        color: '#bf8040',
        opacity: 0.33,
        fill: '#bf8040',
        fillOpacity: 0.33,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4344, 37.7882],
            [-122.4344, 37.7648],
            [-122.4044, 37.7648],
            [-122.4044, 37.7882],
            [-122.4344, 37.7882],
          ],
        ],
      },
    },
    {
      type: 'Feature',
      properties: {
        contour: 5,
        color: '#bfbf40',
        opacity: 0.33,
        fill: '#bfbf40',
        fillOpacity: 0.33,
      },
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [-122.4244, 37.7832],
            [-122.4244, 37.7698],
            [-122.4144, 37.7698],
            [-122.4144, 37.7832],
            [-122.4244, 37.7832],
          ],
        ],
      },
    },
  ],
}
