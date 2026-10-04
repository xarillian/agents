import { line } from './runs.tsx'
import type { Run, Table } from './runs.tsx'

export const CARD_WIDTH = 48

/** A framed card the footer raises over the prompt; the fill keeps the prompt's text from showing through. */
export function card(table: Table, title: readonly Run[], rows: readonly Run[][]) {
  const { Box } = table

  return (
    <Box flexDirection="column" width={CARD_WIDTH} borderStyle="round" borderColor="subtle" backgroundColor="userMessageBackground" paddingX={1}>
      {line(table, title)}
      {rows.map(row => line(table, row))}
    </Box>
  )
}
