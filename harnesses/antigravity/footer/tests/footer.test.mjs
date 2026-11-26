import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { renderFooter } from '../footer.mjs'

const stripAnsi = text => text.replace(/\x1b\[[0-9;]*m/g, '')

const samplePayload = (overrides = {}) => ({
  cwd: '/home/xarillian/.agents',
  workspace: { current_dir: '/home/xarillian/.agents', project_dir: '/home/xarillian/.agents' },
  model: { id: 'Gemini 4 Neon (High)', display_name: 'Gemini 4 Neon (High)', effort: 'high' },
  context_window: {
    context_window_size: 1048576,
    used_percentage: 24.4,
    current_usage: {
      input_tokens: 60000,
      output_tokens: 500,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 20000,
    },
  },
  cost: { total_usd: 0.42 },
  quota: {
    weekly: { remaining_fraction: 0.94, reset_in_seconds: 500000 },
    session: { remaining_fraction: 0.81, reset_in_seconds: 12000 },
    disabled_bucket: { remaining_fraction: 0.1, reset_in_seconds: 100, disabled: true },
  },
  terminal_width: 120,
  ...overrides,
})

describe('antigravity footer', () => {
  it('renders context meter, cost, cache reuse, shortest-first quota, and right-aligned place', () => {
    const out = stripAnsi(renderFooter(samplePayload(), { home: '/home/xarillian', branch: 'main' }))
    assert.match(out, /^▰▰▱▱▱▱▱▱▱▱ 24%  \$0\.42  ◈ 25%  ◆ 81% 94%\s+~\/\.agents · main · Gemini 4 Neon \(High\)$/)
  })

  it('handles a fresh session before the first response', () => {
    const out = stripAnsi(renderFooter({
      cwd: '/home/xarillian/dev/app',
      model: { display_name: 'Gemini 4 Argon' },
      context_window: { context_window_size: 0, current_usage: null },
      terminal_width: 100,
    }, { home: '/home/xarillian', branch: null }))
    assert.match(out, /^\?\?\?\?\?\?\?\?\?\? \?\s+~\/dev\/app · Gemini 4 Argon$/)
  })

  it('switches meter color to warning above 70% and error above 90%', () => {
    const warn = renderFooter(samplePayload({ context_window: { used_percentage: 75 } }))
    const err = renderFooter(samplePayload({ context_window: { used_percentage: 95 } }))
    assert.ok(warn.includes('\x1b[33m75%\x1b[0m'))
    assert.ok(err.includes('\x1b[31m95%\x1b[0m'))
  })

  it('progressively drops location, meter, quota, cache, and cost as width narrows', () => {
    const wide = stripAnsi(renderFooter(samplePayload(), { home: '/home/xarillian', branch: 'main' }))
    const medium = stripAnsi(renderFooter(samplePayload({ terminal_width: 70 }), { home: '/home/xarillian', branch: 'main' }))
    const compact = stripAnsi(renderFooter(samplePayload({ terminal_width: 34 }), { home: '/home/xarillian', branch: 'main' }))
    const tiny = stripAnsi(renderFooter(samplePayload({ terminal_width: 12 }), { home: '/home/xarillian', branch: 'main' }))

    assert.ok(wide.includes('~/.agents · main'))
    assert.ok(!medium.includes('~/.agents'))
    assert.ok(medium.includes('Gemini 4 Neon (High)'))
    assert.ok(!compact.includes('▰'))
    assert.ok(compact.includes('24%  $0.42  ◈ 25%  ◆ 81% 94%'))
    assert.equal(tiny, '24%')
  })

  it('executes as a standalone CLI reading JSON from stdin', () => {
    const script = fileURLToPath(new URL('../footer.mjs', import.meta.url))
    const stdout = execFileSync('node', [script], {
      input: JSON.stringify(samplePayload({ vcs: undefined })),
      encoding: 'utf8',
    })
    assert.ok(stripAnsi(stdout).includes('▰▰▱▱▱▱▱▱▱▱ 24%'))
    assert.ok(stripAnsi(stdout).includes('$0.42'))
  })
})
