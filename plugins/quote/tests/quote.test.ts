import { describe, expect, test } from 'claude-code/testing'

import { firstLine, quoteAt, quoteBlock, quoteDecorations, readThread } from '../hooks/quote.ts'

describe('a highlight becomes a quote at the cursor', () => {
  test('into an empty prompt, the quote comes first with a blank line left for the reply', () => {
    expect(quoteAt('', 'source has three producers.')).toBe('> source has three producers.\n\n')
  })

  test('after words already typed, the quote starts its own paragraph', () => {
    expect(quoteAt('two things first:', 'one')).toBe('\n\n> one\n\n')
  })

  test('after a blank line, no more space is added', () => {
    expect(quoteAt('before\n\n', 'one')).toBe('> one\n\n')
  })

  test('a highlight over several lines stays one quote, blank lines included', () => {
    expect(quoteBlock('The flow:\n\n1. parse\n2. draw')).toBe('> The flow:\n>\n> 1. parse\n> 2. draw')
  })

  test('the offer shows the first line of a long highlight', () => {
    expect(firstLine('one line\nand another')).toBe('one line …')
    expect(firstLine('  just one  ')).toBe('just one')
  })
})

describe('quotes are painted in the prompt', () => {
  test('a quote line is tinted, with an accent marker and italic words', () => {
    expect(quoteDecorations('> drop it')).toEqual([
      { start: 0, end: 2, color: 'warning', backgroundColor: 'userMessageBackgroundHover' },
      { start: 2, end: 9, italic: true, backgroundColor: 'userMessageBackgroundHover' },
    ])
  })

  test('comments between quotes are left as typed, and later quotes are found by their place', () => {
    expect(quoteDecorations('> one\n\nok\n> two').map(({ start, end }) => [start, end])).toEqual([
      [0, 2],
      [2, 5],
      [10, 12],
      [12, 15],
    ])
  })

  test('a prompt with no quotes is not painted', () => {
    expect(quoteDecorations('just a thought')).toEqual([])
  })
})

describe('a sent message reads as a thread', () => {
  test('each quote is followed by the comment written under it', () => {
    expect(readThread("> source has three producers.\n\new, drop it\n\n> Nothing logs below Warn.\n\nfine for now")).toEqual([
      { kind: 'quote', lines: ['source has three producers.'] },
      { kind: 'comment', lines: ['ew, drop it'] },
      { kind: 'quote', lines: ['Nothing logs below Warn.'] },
      { kind: 'comment', lines: ['fine for now'] },
    ])
  })

  test('words before the first quote stay plain text', () => {
    expect(readThread('two notes:\n> one\nok')).toEqual([
      { kind: 'text', lines: ['two notes:'] },
      { kind: 'quote', lines: ['one'] },
      { kind: 'comment', lines: ['ok'] },
    ])
  })

  test('a quote over several lines is one card', () => {
    expect(readThread('> first line\n>\n> second line\n\nthought')).toEqual([
      { kind: 'quote', lines: ['first line', '', 'second line'] },
      { kind: 'comment', lines: ['thought'] },
    ])
  })

  test('only the paragraph under a quote is its reply; later paragraphs stand alone', () => {
    expect(readThread("> one\n\new, drop it\n\nAnother Q before anything else: logs?")).toEqual([
      { kind: 'quote', lines: ['one'] },
      { kind: 'comment', lines: ['ew, drop it'] },
      { kind: 'text', lines: ['Another Q before anything else: logs?'] },
    ])
  })
})
