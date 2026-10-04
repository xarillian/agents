import { describe, expect, test } from 'claude-code/testing'

import { EMPTY_LEDGER, record } from '../hooks/ledger.ts'

const request = (uncached: number, read: number, written: number, output = 10) => ({
  model: 'claude-opus-5-5',
  input_tokens: uncached,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: written,
  output_tokens: output,
})

describe('every model request adds to the ledger', () => {
  test('tokens add up across requests', () => {
    const ledger = record(record(EMPTY_LEDGER, request(100, 0, 900), true), request(50, 900, 50), true)

    expect(ledger).toMatchObject({ input: 150, output: 20, cacheRead: 900, cacheWrite: 950 })
  })

  test('cache reuse is the share of the prompt read back from the cache', () => {
    expect(record(EMPTY_LEDGER, request(10, 900, 90), true).reuse).toEqual([90])
  })

  test('a subagent request costs tokens but leaves the reuse chart alone', () => {
    const ledger = record(EMPTY_LEDGER, request(10, 900, 90), false)

    expect(ledger.input).toBe(10)
    expect(ledger.reuse).toEqual([])
  })

  test('a request with no prompt has no reuse to chart', () => {
    expect(record(EMPTY_LEDGER, request(0, 0, 0), true).reuse).toEqual([])
  })

  test('the chart keeps the newest 64 requests', () => {
    let ledger = EMPTY_LEDGER
    for (let read = 0; read < 70; read++) ledger = record(ledger, request(100 - read, read, 0), true)

    expect(ledger.reuse).toHaveLength(64)
    expect(ledger.reuse[0]).toBe(6)
  })
})
