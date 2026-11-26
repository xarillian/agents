import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, it } from 'node:test'

import { cooldownReport, renderFooter, syncHerdrCooldown } from '../footer.mjs'

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
    '3p-5h': { remaining_fraction: 1, reset_in_seconds: 0 },
    '3p-weekly': { remaining_fraction: 1, reset_in_seconds: 0 },
    'gemini-weekly': { remaining_fraction: 0.94, reset_in_seconds: 500000 },
    'gemini-5h': { remaining_fraction: 0.81, reset_in_seconds: 12000 },
    'gemini-disabled': { remaining_fraction: 0.1, reset_in_seconds: 100, disabled: true },
  },
  terminal_width: 120,
  ...overrides,
})

describe('antigravity footer', () => {
  it('renders context meter, cost, cache reuse, active model quota (5h then weekly), and right-aligned place', () => {
    const out = stripAnsi(renderFooter(samplePayload(), { home: '/home/xarillian', branch: 'main' }))
    assert.match(out, /^▰▰▱▱▱▱▱▱▱▱ 24%  \$0\.42  ◈ 25%  ◆ 81% 94%\s+~\/\.agents · main · Gemini 4 Neon \(High\)$/)
  })

  it('shows 3p quota buckets instead of gemini buckets when running a Claude or GPT model', () => {
    const out = stripAnsi(renderFooter(samplePayload({
      model: { id: 'claude-opus-5-5-high', display_name: 'Claude Opus 5.5 (High)' },
      quota: {
        '3p-weekly': { remaining_fraction: 0.88, reset_in_seconds: 0 },
        '3p-5h': { remaining_fraction: 0.45, reset_in_seconds: 9000 },
        'gemini-5h': { remaining_fraction: 0.99, reset_in_seconds: 12000 },
        'gemini-weekly': { remaining_fraction: 0.99, reset_in_seconds: 500000 },
      },
    }), { home: '/home/xarillian', branch: 'main' }))
    assert.ok(out.includes('◆ 45% 88%'))
    assert.ok(!out.includes('99%'))
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

describe('antigravity Herdr cooldown reporting', () => {
  const NOW = 1_795_728_000_000

  it('picks the latest reset among exhausted buckets in the active model pool', () => {
    const report = cooldownReport(samplePayload({
      quota: {
        'gemini-5h': { remaining_fraction: 0, reset_in_seconds: 3_600 },
        'gemini-weekly': { remaining_fraction: 0, reset_in_seconds: 86_400 },
        '3p-5h': { remaining_fraction: 1, reset_in_seconds: 0 },
      },
    }), NOW)
    assert.deepEqual(report, {
      pool: 'antigravity/gemini',
      checked: true,
      resetAt: NOW + 86_400_000,
    })
  })

  it('ignores exhausted buckets from the inactive pool or disabled buckets', () => {
    const report = cooldownReport(samplePayload({
      quota: {
        'gemini-5h': { remaining_fraction: 0.5, reset_in_seconds: 3_600 },
        'gemini-disabled': { remaining_fraction: 0, reset_in_seconds: 9_000, disabled: true },
        '3p-5h': { remaining_fraction: 0, reset_in_seconds: 7_200 },
      },
    }), NOW)
    assert.deepEqual(report, {
      pool: 'antigravity/gemini',
      checked: true,
      resetAt: 0,
    })
  })

  it('marks quota unchecked when the payload has no active-pool buckets', () => {
    const report = cooldownReport({ model: { id: 'Gemini 4 Neon' } }, NOW)
    assert.deepEqual(report, { pool: 'antigravity/gemini', checked: false, resetAt: 0 })
  })

  it('publishes Herdr labels on state transitions and suppresses jitter duplicates', () => {
    const cacheDir = mkdtempSync(join(tmpdir(), 'agy-footer-test-'))
    const calls = []
    const runHc = args => calls.push(args)
    const env = { HC_TERMINAL_ID: 't13' }

    try {
      const exhausted = samplePayload({
        quota: { 'gemini-5h': { remaining_fraction: 0, reset_in_seconds: 7_200 } },
      })
      assert.equal(syncHerdrCooldown(exhausted, { env, now: NOW, cacheDir, runHc }), true)
      assert.deepEqual(calls.at(-1), [
        'label', 't13',
        'usage.pool=antigravity/gemini',
        `usage.cooldown=${NOW + 7_200_000}`,
        `usage.at=${NOW}`,
      ])

      // 2 seconds later, reset_in_seconds ticks down by 2s (within 60s drift): no hc spam.
      const ticked = samplePayload({
        quota: { 'gemini-5h': { remaining_fraction: 0, reset_in_seconds: 7_198 } },
      })
      assert.equal(syncHerdrCooldown(ticked, { env, now: NOW + 2_000, cacheDir, runHc }), false)
      assert.equal(calls.length, 1)

      // Switching to a 3p model with quota immediately publishes the new pool and clears cooldown.
      const switched = samplePayload({
        model: { id: 'claude-opus-5-5-high', display_name: 'Claude Opus 5.5' },
        quota: { '3p-5h': { remaining_fraction: 0.7, reset_in_seconds: 5_000 } },
      })
      assert.equal(syncHerdrCooldown(switched, { env, now: NOW + 5_000, cacheDir, runHc }), true)
      assert.deepEqual(calls.at(-1), [
        'label', 't13',
        'usage.pool=antigravity/3p',
        'usage.cooldown=',
        `usage.at=${NOW + 5_000}`,
      ])
    } finally {
      rmSync(cacheDir, { recursive: true, force: true })
    }
  })

  it('does nothing outside Herdr', () => {
    const calls = []
    assert.equal(syncHerdrCooldown(samplePayload(), { env: {}, runHc: args => calls.push(args) }), false)
    assert.equal(calls.length, 0)
  })
})
