import type { Elements } from 'claude-code'

export type Table = Elements['terminal']

/** A stretch of one style. The footer measures runs to pick the richest line that fits. */
export type Run = { text: string; color?: string; isDim?: boolean }

export const ACCENT = 'claude'
const FAINT = 'subtle'

export const plain = (text: string): Run => ({ text })
export const muted = (text: string): Run => ({ text, isDim: true })
export const faint = (text: string): Run => ({ text, color: FAINT })
export const tinted = (color: string, text: string): Run => ({ text, color })

export const widthOf = (runs: readonly Run[]) => runs.reduce((sum, run) => sum + run.text.length, 0)

export function line({ Text }: Table, runs: readonly Run[]) {
  return (
    <Text wrap="truncate-end">
      {runs.map(run => (
        <Text color={run.color} dimColor={run.isDim}>
          {run.text}
        </Text>
      ))}
    </Text>
  )
}
