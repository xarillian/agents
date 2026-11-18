import type { PromptDecoration } from 'claude-code'

/** Every line of the selection is quoted, blank ones too, so a multi-paragraph quote stays one block. */
export const quoteBlock = (selection: string) =>
  selection
    .trim()
    .split('\n')
    .map(line => (line.trim() ? `> ${line.trimEnd()}` : '>'))
    .join('\n')

/**
 * What to insert at the cursor so the quote is its own paragraph, never running
 * into the words before it, with a blank line left beneath for the reply.
 */
export function quoteAt(textBeforeCursor: string, selection: string): string {
  const before = textBeforeCursor
  const lead = !before.trim() ? '' : before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n'

  return `${lead}${quoteBlock(selection)}\n\n`
}

export const firstLine = (selection: string) => {
  const lines = selection.trim().split('\n')
  return lines.length > 1 ? `${lines[0]} …` : (lines[0] ?? '')
}

const QUOTE_MARK = /^\s*>\s?/

const isQuoteLine = (line: string) => QUOTE_MARK.test(line)

export const hasQuote = (text: string) => text.split('\n').some(isQuoteLine)

const TINT = 'userMessageBackgroundHover'

/** Tints each quote line in the prompt so it reads as a block: the marker in the accent, the words in italics. */
export function quoteDecorations(text: string): PromptDecoration[] {
  const runs: PromptDecoration[] = []
  let offset = 0

  for (const line of text.split('\n')) {
    const marker = QUOTE_MARK.exec(line)?.[0]
    if (marker) {
      runs.push({ start: offset, end: offset + marker.length, color: 'warning', backgroundColor: TINT })
      if (line.length > marker.length) {
        runs.push({ start: offset + marker.length, end: offset + line.length, italic: true, backgroundColor: TINT })
      }
    }
    offset += line.length + 1
  }

  return runs
}

export type Part = { kind: 'text' | 'quote' | 'comment'; lines: string[] }

/**
 * Reads a message as a thread: each quote with the paragraph written straight
 * under it as its reply. Anything else (an opening, a later paragraph, another
 * question) stays plain, since not every word in a message answers a quote.
 */
export function readThread(text: string): Part[] {
  const parts: Part[] = []

  for (const line of text.split('\n')) {
    const current = parts.at(-1)
    if (isQuoteLine(line)) {
      if (current?.kind === 'quote') current.lines.push(line.replace(QUOTE_MARK, ''))
      else parts.push({ kind: 'quote', lines: [line.replace(QUOTE_MARK, '')] })
    } else if (!line.trim()) {
      if (current && current.kind !== 'quote') current.lines.push(line)
    } else if (current?.kind === 'quote') parts.push({ kind: 'comment', lines: [line] })
    else if (current?.kind === 'comment' && current.lines.at(-1)?.trim()) current.lines.push(line)
    else if (current?.kind === 'text') current.lines.push(line)
    else parts.push({ kind: 'text', lines: [line] })
  }

  return parts.map(part => ({ ...part, lines: trimBlankEnds(part.lines) })).filter(part => part.lines.length > 0)
}

function trimBlankEnds(lines: string[]) {
  const first = lines.findIndex(line => line.trim())
  const last = lines.findLastIndex(line => line.trim())

  return first === -1 ? [] : lines.slice(first, last + 1)
}
