import type { TurnUsage } from 'claude-code'

import type { Ledger } from '../types'

const REUSE_SAMPLES = 64

export const EMPTY_LEDGER: Ledger = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reuse: [] }

/**
 * Adds one model request to the session's totals. Only the main conversation
 * charts cache reuse: a subagent's prompt is a cache of its own, and mixing
 * the two would make the graph saw up and down.
 */
export function record(ledger: Ledger, usage: TurnUsage, isMainLoop: boolean): Ledger {
  const prompt = usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens
  const isCharted = isMainLoop && prompt > 0

  return {
    input: ledger.input + usage.input_tokens,
    output: ledger.output + usage.output_tokens,
    cacheRead: ledger.cacheRead + usage.cache_read_input_tokens,
    cacheWrite: ledger.cacheWrite + usage.cache_creation_input_tokens,
    reuse: isCharted ? [...ledger.reuse, (usage.cache_read_input_tokens / prompt) * 100].slice(-REUSE_SAMPLES) : ledger.reuse,
  }
}
