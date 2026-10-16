import { describe, expect, it } from 'vitest'
import { agenciesFromManifest } from './manifestAgencies'

const HEADER =
  'feed_dir,mdb_source_id,provider,name,subdivision,municipality,license_url,source_url,source_url_kind,outcome,detail,bytes,sha256,fetched_at'

function manifest(...rows: string[]): string {
  return [HEADER, ...rows].join('\r\n') + '\r\n'
}

describe('agenciesFromManifest', () => {
  it('credits only feeds that made it into the routing graph', () => {
    const csv = manifest(
      'mdb-15,15,Orange County Transportation Authority (OCTA),,California,Orange,,https://octa.example/gtfs.zip,urls.direct_download,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'mdb-20,20,Fresno Area Express,,California,Fresno,,https://fax.example/gtfs.zip,urls.latest,cached,,100,abc,2026-10-04T09:05:00+00:00',
      'mdb-30,30,Caltrain,,California,,,https://caltrain.example/gtfs.zip,urls.latest,superseded-by-511,same 511 request as 511-CT,0,,',
      'mdb-31,31,Broken Archive Transit,,California,,,https://broken.example/gtfs.zip,urls.latest,unusable-archive,,0,,',
      'mdb-32,32,Half Feed Transit,,California,,,https://half.example/gtfs.zip,urls.latest,incomplete-feed,,0,,',
      'mdb-33,33,Never Tried Transit,,California,,,https://never.example/gtfs.zip,urls.latest,pending,,0,,',
    )

    expect(agenciesFromManifest(csv).agencies).toEqual([
      { name: 'Fresno Area Express', href: 'https://fax.example/gtfs.zip' },
      { name: 'Orange County Transportation Authority (OCTA)', href: 'https://octa.example/gtfs.zip' },
    ])
  })

  it('leaves 511 feeds to the page’s own 511.org credit', () => {
    const csv = manifest(
      '511-AC,511-AC,AC TRANSIT,511 Bay Area GTFS (operator_id=AC),California,,https://511.org/open-data/transit,https://api.511.org/transit/datafeeds?operator_id=AC&api_key=REDACTED,urls.direct_download,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'extra-avta,extra-avta,Antelope Valley Transit Authority,,California,,,https://avta.example/gtfs.zip,urls.direct_download,fetched,,100,abc,2026-10-11T09:05:00+00:00',
    )

    expect(agenciesFromManifest(csv).agencies).toEqual([
      { name: 'Antelope Valley Transit Authority', href: 'https://avta.example/gtfs.zip' },
    ])
  })

  it('names an agency with several feeds once, linking the same feed whatever order the manifest lists them in', () => {
    const fixed = 'mdb-41,41,"Commerce, City of",Fixed route,California,,,https://commerce.example/fixed.zip,urls.latest,fetched,,100,abc,2026-10-11T09:05:00+00:00'
    const flex = 'mdb-40,40,"Commerce, City of",Flex,California,,,https://commerce.example/flex.zip,urls.latest,cached,,100,abc,2026-10-11T09:05:00+00:00'
    const expected = [{ name: 'Commerce, City of', href: 'https://commerce.example/fixed.zip' }]

    expect(agenciesFromManifest(manifest(fixed, flex)).agencies).toEqual(expected)
    expect(agenciesFromManifest(manifest(flex, fixed)).agencies).toEqual(expected)
  })

  it('names an agency once when its flex feed lists it without the bracketed name its fixed-route feed carries', () => {
    const csv = manifest(
      'mdb-60,60,City of Tracy,,California,,,https://tracy.example/flex.zip,urls.latest,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'mdb-61,61,City of Tracy (TRACER),,California,,,https://tracy.example/fixed.zip,urls.latest,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'mdb-62,62,Silver Rider Transit (Laughlin),,Nevada,,,https://silver.example/laughlin.zip,urls.latest,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'mdb-63,63,Silver Rider Transit (Mesquite),,Nevada,,,https://silver.example/mesquite.zip,urls.latest,fetched,,100,abc,2026-10-11T09:05:00+00:00',
    )

    expect(agenciesFromManifest(csv).agencies).toEqual([
      { name: 'City of Tracy (TRACER)', href: 'https://tracy.example/fixed.zip' },
      { name: 'Silver Rider Transit (Laughlin)', href: 'https://silver.example/laughlin.zip' },
      { name: 'Silver Rider Transit (Mesquite)', href: 'https://silver.example/mesquite.zip' },
    ])
  })

  it('links the Mobility Database page for a feed whose own link needs a key or is missing', () => {
    const csv = manifest(
      'mdb-50,50,Keyed Transit,,California,,,https://keyed.example/gtfs.zip?api_key=REDACTED,urls.direct_download,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'mdb-51,51,Linkless Transit,,California,,,,,cached,,100,abc,2026-10-11T09:05:00+00:00',
    )

    expect(agenciesFromManifest(csv).agencies).toEqual([
      { name: 'Keyed Transit', href: 'https://mobilitydatabase.org/feeds/gtfs/mdb-50' },
      { name: 'Linkless Transit', href: 'https://mobilitydatabase.org/feeds/gtfs/mdb-51' },
    ])
  })

  it('dates the list by the newest fetch among the credited feeds', () => {
    const csv = manifest(
      'mdb-20,20,Fresno Area Express,,California,,,https://fax.example/gtfs.zip,urls.latest,cached,,100,abc,2026-10-04T09:05:00+00:00',
      'mdb-15,15,OCTA,,California,,,https://octa.example/gtfs.zip,urls.latest,fetched,,100,abc,2026-10-11T09:05:00+00:00',
      'mdb-33,33,Never Tried Transit,,California,,,https://never.example/gtfs.zip,urls.latest,unusable-archive,,0,,2026-10-12T09:05:00+00:00',
    )

    expect(agenciesFromManifest(csv).manifestDate).toBe('2026-10-11')
  })
})
