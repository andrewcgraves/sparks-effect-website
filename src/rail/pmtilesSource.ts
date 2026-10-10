import { PMTiles } from 'pmtiles'
import type { RailTileSource } from './railGraph'

export function pmtilesSource(url: string): RailTileSource {
  const archive = new PMTiles(url)
  return {
    async tile(z, x, y) {
      // getZxy already undoes the archive's tile compression; what comes back
      // is the bare MVT protobuf.
      const response = await archive.getZxy(z, x, y)
      return response ? new Uint8Array(response.data) : null
    },
  }
}
