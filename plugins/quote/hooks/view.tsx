import type { Elements } from 'claude-code'

import { firstLine, readThread } from './quote.ts'
import type { Part } from './quote.ts'

type Table = Elements['terminal' | 'desktop' | 'vscode']

export type OfferActions = {
  quote: () => void
  dismiss: () => void
}

/** Above the prompt: the current highlight, ready to quote. */
export function offer({ Box, Button, Text }: Table, selection: string, actions: OfferActions) {
  return (
    <Box flexDirection="row" gap={1}>
      <Text color="warning">❝</Text>
      <Box flexShrink={1}>
        <Text wrap="truncate-end">{firstLine(selection)}</Text>
      </Box>
      <Button key="quote" label="Quote" variant="primary" onPress={actions.quote} />
      <Button key="dismiss" plain role="dismiss" label="✕" onPress={actions.dismiss} />
    </Box>
  )
}

/** The person's own message in the transcript, drawn as a thread. */
export function quotedMessage(table: Table, text: string) {
  const { Box, Text } = table

  return (
    <Box flexDirection="row">
      <Text dimColor>{'❯ '}</Text>
      {thread(table, text)}
    </Box>
  )
}

/** Each quote a card labelled with who said it, the reply hung under it, any other words left plain. */
function thread(table: Table, text: string) {
  const { Box } = table

  return (
    <Box flexDirection="column" flexShrink={1}>
      {readThread(text).map((part, index) => (
        <Box key={`part-${index}`} flexDirection="column" marginTop={index > 0 && part.kind !== 'comment' ? 1 : 0}>
          {threadPart(table, part)}
        </Box>
      ))}
    </Box>
  )
}

function threadPart(table: Table, part: Part) {
  if (part.kind === 'quote') return quoteCard(table, part.lines)
  if (part.kind === 'comment') return comment(table, part.lines)

  const { Text } = table
  return part.lines.map(line => <Text wrap="wrap">{line || ' '}</Text>)
}

/** The label is drawn after the card so it lands on top of the border it sits in. */
function quoteCard({ Box, Text }: Table, lines: string[]) {
  return (
    <Box flexDirection="column" alignSelf="flex-start">
      <Box flexDirection="column" borderStyle="round" borderColor="subtle" paddingX={1}>
        {lines.map(line => (
          <Text italic wrap="wrap">
            {line || ' '}
          </Text>
        ))}
      </Box>
      <Box position="absolute" top={0} left={2}>
        <Text color="briefLabelClaude">{' Claude '}</Text>
      </Box>
    </Box>
  )
}

function comment({ Box, Text }: Table, lines: string[]) {
  return lines.map((line, index) => (
    <Box flexDirection="row" marginLeft={2}>
      <Text color="briefLabelYou">{index === 0 ? '↳ ' : '  '}</Text>
      <Box flexShrink={1}>
        <Text wrap="wrap">{line || ' '}</Text>
      </Box>
    </Box>
  ))
}
