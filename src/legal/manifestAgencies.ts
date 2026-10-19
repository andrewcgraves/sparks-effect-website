// Turns a generation's gtfs-manifest.csv (written by kustomize-config's
// fetch-gtfs-feeds.py) into the agency list the attribution page credits.
// Imports nothing, so scripts/transit-agencies.ts can load it with Node's type
// stripping.

export interface TransitAgency {
  name: string
  href: string
}

type Row = Record<string, string>

const INGESTED = new Set(['fetched', 'cached'])

// RFC 4180, as Python's csv module writes it: quoted fields may hold commas,
// doubled quotes and line breaks.
function parseCsv(text: string): string[][] {
  const records: string[][] = []
  let record: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"'
        i++
      } else if (char === '"') {
        quoted = false
      } else {
        field += char
      }
    } else if (char === '"') {
      quoted = true
    } else if (char === ',') {
      record.push(field)
      field = ''
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[i + 1] === '\n') i++
      record.push(field)
      records.push(record)
      record = []
      field = ''
    } else {
      field += char
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field)
    records.push(record)
  }
  return records
}

// fetch-gtfs-feeds.py blanks a credential in the query to REDACTED, which
// would publish a link that cannot work. Every catalog feed has a Mobility
// Database page; the extra- feeds it adds by hand are public downloads.
function feedLink(row: Row): string {
  if (row.source_url && !/=REDACTED(&|$)/.test(row.source_url)) return row.source_url
  if (row.feed_dir.startsWith('mdb-')) return `https://mobilitydatabase.org/feeds/gtfs/${row.feed_dir}`
  throw new Error(`${row.feed_dir} (${row.provider}) has no public link to credit`)
}

function rows(text: string): Row[] {
  const [header = [], ...body] = parseCsv(text)
  return body.map((values) => Object.fromEntries(header.map((column, index) => [column, values[index] ?? ''])))
}

// A flex feed often names its agency without the bracketed short name its
// fixed-route feed carries ("City of Tracy" beside "City of Tracy (TRACER)").
// With two bracketed names to choose from ("Silver Rider Transit (Laughlin)",
// "(Mesquite)") the bare one is a different listing, so it keeps its own name.
function creditedNames(providers: string[]): Map<string, string> {
  return new Map(providers.map((provider) => {
    const bracketed = providers.filter((other) => other.startsWith(`${provider} (`) && other.endsWith(')'))
    return [provider, bracketed.length === 1 ? bracketed[0] : provider]
  }))
}

export function agenciesFromManifest(csv: string): { agencies: TransitAgency[]; manifestDate: string } {
  const ingested = rows(csv).filter((row) => INGESTED.has(row.outcome))
  // The page's "Data provided by 511.org" line already covers every feed
  // that came through 511, which is what 511's agreement asks for.
  const credited = ingested.filter((row) => !row.feed_dir.startsWith('511-'))
  const names = creditedNames([...new Set(credited.map((row) => row.provider))])
  const agencies = credited
    .map((row) => ({ name: names.get(row.provider) ?? row.provider, renamed: names.get(row.provider) !== row.provider, href: feedLink(row) }))
    // A merged agency links the feed that carries the name it is credited
    // under; ordering by link too means an agency with several feeds keeps
    // the same link when a regeneration lists them the other way.
    .sort((a, b) => a.name.localeCompare(b.name, 'en') || Number(a.renamed) - Number(b.renamed) || a.href.localeCompare(b.href, 'en'))
    .map(({ name, href }) => ({ name, href }))
  // A cached feed keeps the time of its last download, so the newest time is
  // when the feeds were last fetched. ISO 8601 UTC strings sort as times.
  const newestFetch = ingested.map((row) => row.fetched_at).sort().at(-1) ?? ''
  return {
    agencies: agencies.filter((agency, index) => index === 0 || agencies[index - 1].name !== agency.name),
    manifestDate: newestFetch.slice(0, 10),
  }
}
