export type DescriptionPart = { text: string; href?: string }

const LINK = /\[([^\]\n]+)\]\((https:\/\/[^\s()]+)\)/g

function httpsHref(raw: string): string | null {
  try {
    const url = new URL(raw)
    return url.protocol === 'https:' && url.host ? url.href : null
  } catch {
    return null
  }
}

export function descriptionParts(description: string): DescriptionPart[] {
  const parts: DescriptionPart[] = []
  let at = 0
  for (const match of description.matchAll(LINK)) {
    const href = httpsHref(match[2])
    if (!href) continue
    if (match.index > at) parts.push({ text: description.slice(at, match.index) })
    parts.push({ text: match[1], href })
    at = match.index + match[0].length
  }
  if (at < description.length) parts.push({ text: description.slice(at) })
  return parts
}

export function plainDescription(description: string): string {
  return descriptionParts(description).map((part) => part.text).join('')
}
