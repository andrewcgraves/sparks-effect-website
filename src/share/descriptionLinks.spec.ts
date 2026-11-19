import { describe, expect, it } from 'vitest'
import { descriptionParts, plainDescription } from './descriptionLinks'

describe('descriptionParts', () => {
  it('keeps a description with no links as one piece of text', () => {
    expect(descriptionParts('Line one.\n\nLine two.')).toEqual([{ text: 'Line one.\n\nLine two.' }])
  })

  it('turns [text](https://...) into a link between the text around it', () => {
    expect(descriptionParts('Want it sooner? [Sign the petition](https://example.org/p). Notes:')).toEqual([
      { text: 'Want it sooner? ' },
      { text: 'Sign the petition', href: 'https://example.org/p' },
      { text: '. Notes:' },
    ])
  })

  it('finds every link', () => {
    const parts = descriptionParts('[a](https://a.example/) and [b](https://b.example/x)')
    expect(parts.filter((part) => part.href).map((part) => part.href)).toEqual([
      'https://a.example/',
      'https://b.example/x',
    ])
  })

  it('leaves anything but an https link as written', () => {
    for (const written of [
      '[x](http://example.org)',
      '[x](javascript:alert(1))',
      '[x](/relative)',
      '[x](https://)',
    ]) {
      expect(descriptionParts(written)).toEqual([{ text: written }])
    }
  })
})

describe('plainDescription', () => {
  it('reduces each link to its text', () => {
    expect(plainDescription('Want it sooner? [Sign the petition](https://example.org/p).')).toBe(
      'Want it sooner? Sign the petition.',
    )
  })
})
