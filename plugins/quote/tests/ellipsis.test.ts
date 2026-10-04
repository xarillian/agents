import { describe, expect, test } from 'claude-code/testing'

import { withEllipses } from '../hooks/ellipsis.ts'

const REPLY = [
  'The detector reads the final reply. source has three producers and zero consumers. Nothing in **Chorus** logs below `Warn`.',
  '',
  '- Keep the cache warm between runs',
  '1. Drop the cache: it costs 2 GiB',
].join('\n')

const quote = (selection: string) => withEllipses(selection, ['An older reply.', REPLY])

describe('a highlight cut from a sentence is marked where it was cut', () => {
  test('a whole sentence needs no mark', () => {
    expect(quote('source has three producers and zero consumers.')).toBe('source has three producers and zero consumers.')
  })

  test('a whole sentence without its full stop needs no mark', () => {
    expect(quote('Nothing in Chorus logs below Warn')).toBe('Nothing in Chorus logs below Warn')
  })

  test('the opening of a sentence is marked at its end', () => {
    expect(quote('source has three producers')).toBe('source has three producers…')
  })

  test('the close of a sentence is marked at its start', () => {
    expect(quote('zero consumers.')).toBe('…zero consumers.')
  })

  test('the middle of a sentence is marked at both ends', () => {
    expect(quote('three producers and')).toBe('…three producers and…')
  })

  test('a list item read from its start is not cut before', () => {
    expect(quote('Keep the cache warm')).toBe('Keep the cache warm…')
  })

  test('words after a colon begin a clause of their own', () => {
    expect(quote('it costs 2 GiB')).toBe('it costs 2 GiB')
  })

  test('markdown in the reply does not hide the match', () => {
    expect(quote('in Chorus logs below Warn.')).toBe('…in Chorus logs below Warn.')
  })

  test('a highlight over two lines keeps its lines, marked only at its ends', () => {
    expect(quote('Keep the cache warm between runs\n1. Drop the')).toBe(
      'Keep the cache warm between runs\n1. Drop the…',
    )
  })

  test('text found in no reply is quoted exactly as highlighted', () => {
    expect(withEllipses('cargo build failed', [REPLY])).toBe('cargo build failed')
  })
})
