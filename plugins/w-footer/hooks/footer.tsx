import type { RenderElement, SessionContextUsage, SessionRateLimit } from 'claude-code'

import type { Ledger } from '../types'
import { cacheCard } from './cache-card.tsx'
import { CARD_WIDTH } from './card.tsx'
import { homePath, singleLine } from './format.ts'
import { LIMITS_COLOR, limitsCard, remaining, shortestFirst } from './limits.tsx'
import { ACCENT, faint, line, muted, plain, tinted, widthOf } from './runs.tsx'
import type { Run, Table } from './runs.tsx'

export type FooterState = {
  cwd: string
  home?: string
  branch: string | null
  model: string
  context: SessionContextUsage
  ledger: Ledger
  cost: number
  rateLimits: readonly SessionRateLimit[]
  now: number
  isPinned: boolean
}

/** A figure on the glance row; one with a card raises it on hover. */
type Figure = { runs: Run[]; hover?: { key: string; card: RenderElement; isPinned: boolean } }

const PART_GAP = 2
const SIDE_GAP = 4

/** Claude Code pads the hint row by two cells on each side. */
const FOOTER_INSET = 4

/**
 * The engine's own line carries the permission mode and the live pills. It is
 * drawn above the rest wherever it sits in the tree, and left out, the mode is
 * squeezed into a column beside the footer.
 */
export function footer(table: Table, hint: RenderElement, state: FooterState, columns: number) {
  const { Box } = table
  const width = Math.max(1, columns - FOOTER_INSET)

  return (
    <Box flexDirection="column">
      {hint}
      {glance(table, state, width)}
    </Box>
  )
}

/** The figures on the left, the richest set that fits; where and on what model on the right, in the room left. */
function glance(table: Table, state: FooterState, width: number) {
  const { Box } = table
  const figures = fittingFigures(table, state, width)
  const room = width - figuresWidth(figures) - SIDE_GAP
  const place = fittingPlace(state, room)

  return (
    <Box flexDirection="row" justifyContent="space-between" width={width}>
      <Box flexDirection="row" gap={PART_GAP}>
        {figures.map((figure, index) =>
          figure.hover ? badge(table, figure.runs, figure.hover, cardShift(figures, index, width)) : line(table, figure.runs),
        )}
      </Box>
      {place && line(table, place)}
    </Box>
  )
}

function fittingFigures(table: Table, state: FooterState, width: number): Figure[] {
  const percent = contextPercent(state.context)
  const tone = percent !== undefined && percent > 90 ? 'error' : percent !== undefined && percent > 70 ? 'warning' : ACCENT
  const value = tinted(tone, percent === undefined ? '?' : `${Math.round(percent)}%`)
  const context = { runs: [...meter(percent, tone), plain(' '), value] }
  const compactContext = { runs: [value] }
  const cost = { runs: [plain(`$${state.cost.toFixed(2)}`)] }
  const cache = cacheFigure(table, state)
  const limits = limitsFigure(table, state)

  const candidates = [
    [context, cost, cache, limits],
    [compactContext, cost, cache, limits],
    [compactContext, cost, cache],
    [compactContext, cost],
    [compactContext],
  ].map(figures => figures.filter(figure => figure !== null))

  return candidates.find(figures => figuresWidth(figures) <= width) ?? candidates.at(-1)!
}

function cacheFigure(table: Table, { ledger, isPinned }: FooterState): Figure | null {
  const latest = ledger.reuse.at(-1)
  if (latest === undefined) return null

  return {
    runs: [muted('◈ '), tinted(ACCENT, `${Math.round(latest)}%`)],
    hover: { key: 'cache', card: cacheCard(table, ledger, isPinned), isPinned },
  }
}

/** What remains of each rate-limit window, the session window first. */
function limitsFigure(table: Table, { rateLimits, now }: FooterState): Figure | null {
  if (rateLimits.length === 0) return null
  const left = shortestFirst(rateLimits).map(limit => `${remaining(limit)}%`)

  return {
    runs: [tinted(LIMITS_COLOR, `◆ ${left.join(' ')}`)],
    hover: { key: 'limits', card: limitsCard(table, rateLimits, now), isPinned: false },
  }
}

function fittingPlace(state: FooterState, room: number): Run[] | null {
  const model = plain(singleLine(state.model).replace(/^claude-/, ''))
  const location = [homePath(state.cwd, state.home), state.branch]
    .filter(part => part !== null)
    .map(singleLine)
    .join(' · ')
  const options = [[muted(`${location} · `), model], [model]]

  return options.find(option => widthOf(option) <= room) ?? null
}

/** How far left a card moves from its badge so it stays on screen, never past the footer's own start. */
function cardShift(figures: readonly Figure[], index: number, width: number): number {
  const start = figuresWidth(figures.slice(0, index)) + (index > 0 ? PART_GAP : 0)
  return Math.max(-start, Math.min(0, width - start - CARD_WIDTH))
}

const figuresWidth = (figures: readonly Figure[]) =>
  widthOf(figures.flatMap(figure => figure.runs)) + PART_GAP * (figures.length - 1)

/** The engine rounds its percentage; worked out again from the tokens, the meter fills by the true share. */
function contextPercent({ tokens, window, percent }: SessionContextUsage): number | undefined {
  return tokens !== undefined && window > 0 ? (tokens / window) * 100 : percent
}

function meter(percent: number | undefined, tone: string): Run[] {
  if (percent === undefined) return [faint('??????????')]
  const filled = Math.round(Math.max(0, Math.min(100, percent)) / 10)
  return [tinted(tone, '▰'.repeat(filled)), faint('▱'.repeat(10 - filled))]
}

/** Hovering the badge raises its card over the prompt, clear of the mode line; a pinned card stays up. */
function badge(table: Table, runs: Run[], { key, card, isPinned }: NonNullable<Figure['hover']>, shift: number) {
  const { Box } = table

  return (
    <Box key={key} flexDirection="row">
      {line(table, runs)}
      {isPinned ? (
        <Box position="absolute" left={shift} bottom={2}>
          {card}
        </Box>
      ) : (
        <Box position="absolute" left={shift} bottom={2} display="none" hover={{ display: 'flex' }}>
          {card}
        </Box>
      )}
    </Box>
  )
}
