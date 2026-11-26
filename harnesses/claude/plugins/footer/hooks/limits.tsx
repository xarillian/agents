import type { SessionRateLimit } from 'claude-code'

import { card } from './card.js'
import { compactCountdown } from './format.js'
import { muted, plain, tinted } from './runs.js'
import type { Run, Table } from './runs.js'

export const LIMITS_COLOR = 'warning'

const WINDOWS = [
  { kind: 'five_hour', label: 'session (5h)' },
  { kind: 'seven_day', label: 'weekly (7d)' },
]

export function shortestFirst(limits: readonly SessionRateLimit[]): SessionRateLimit[] {
  return [...limits].sort((a, b) => rank(a.kind) - rank(b.kind))
}

export function remaining({ percentUsed }: SessionRateLimit): number {
  return Math.round(100 - Math.max(0, Math.min(100, percentUsed)))
}

/** Latest reset timestamp among exhausted windows, 0 when usage remains, or undefined when limits are unknown. */
export function cooldownResetAt(limits: readonly SessionRateLimit[], now: number): number | undefined {
  if (limits.length === 0) return undefined
  const exhausted = limits
    .filter(limit => limit.percentUsed >= 100 && limit.resetsAt !== undefined)
    .map(limit => Date.parse(limit.resetsAt!))
    .filter(resetAt => Number.isFinite(resetAt) && resetAt > now)
  return exhausted.length > 0 ? Math.max(...exhausted) : 0
}

export function limitsCard(table: Table, limits: readonly SessionRateLimit[], now: number) {
  const windows = shortestFirst(limits)
  const labelWidth = Math.max(...windows.map(limit => label(limit.kind).length))

  return card(
    table,
    [tinted(LIMITS_COLOR, 'Rate limits')],
    windows.map(limit => windowRow(limit, labelWidth, now)),
  )
}

function windowRow(limit: SessionRateLimit, labelWidth: number, now: number): Run[] {
  const countdown = limit.resetsAt === undefined ? undefined : compactCountdown(Date.parse(limit.resetsAt), now)

  return [
    muted(`${label(limit.kind).padEnd(labelWidth)}  `),
    plain(`${remaining(limit)}% left`),
    ...(countdown ? [muted(` ↻ ${countdown}`)] : []),
  ]
}

function label(kind: string): string {
  return WINDOWS.find(window => window.kind === kind)?.label ?? kind.replaceAll('_', ' ')
}

function rank(kind: string): number {
  const index = WINDOWS.findIndex(window => window.kind === kind)
  return index === -1 ? WINDOWS.length : index
}
