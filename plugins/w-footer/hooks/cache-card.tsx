import type { Ledger } from '../types'
import { card, CARD_WIDTH } from './card.tsx'
import { formatTokens } from './format.ts'
import { ACCENT, muted, plain, tinted } from './runs.tsx'
import type { Run, Table } from './runs.tsx'

const AXIS_WIDTH = 6
const PLOT_WIDTH = CARD_WIDTH - 4 - AXIS_WIDTH
const BLOCKS = ' ▁▂▃▄▅▆▇█'
const ROWS = 4

export function cacheCard(table: Table, ledger: Ledger, isPinned: boolean) {
  const samples = ledger.reuse.slice(-PLOT_WIDTH)
  const title = [tinted(ACCENT, 'Cache reuse'), ...(isPinned ? [muted(' · pinned')] : [])]
  const graph = samples.length === 0 ? [[plain('No history yet.')]] : [...plot(samples), [plain(summary(samples))]]

  return card(table, title, [...graph, tokens(ledger)])
}

/** Four rows of eighth blocks, top row first; neighbouring bars alternate shade so single requests stay countable. */
function plot(samples: readonly number[]): Run[][] {
  const rows: Run[][] = []
  for (let row = ROWS - 1; row >= 0; row--) {
    const axis = row === ROWS - 1 ? '100% │' : row === 0 ? '  0% │' : '     │'
    const bars = samples.map((percent, index) => ({ ...tinted(ACCENT, bar(percent, row)), isDim: index % 2 === 1 }))
    rows.push([muted(axis), ...bars])
  }
  return rows
}

function bar(percent: number, row: number): string {
  const height = Math.round((Math.max(0, Math.min(100, percent)) / 100) * ROWS * 8)
  if (height === 0 && row === 0) return '·'
  return BLOCKS[Math.max(0, Math.min(8, height - row * 8))]!
}

function summary(samples: readonly number[]): string {
  return `${samples.at(-1)!.toFixed(1)}% latest · ${samples.length} ${samples.length === 1 ? 'request' : 'requests'}`
}

function tokens({ input, output, cacheRead, cacheWrite }: Ledger): Run[] {
  return [
    muted('↑'),
    plain(formatTokens(input)),
    muted(' in  ↓'),
    plain(formatTokens(output)),
    muted(' out  '),
    plain(formatTokens(cacheRead)),
    muted(' read  '),
    plain(formatTokens(cacheWrite)),
    muted(' stored'),
  ]
}
