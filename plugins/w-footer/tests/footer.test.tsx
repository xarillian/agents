import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface, SessionUsage, TurnUsage } from 'claude-code'

const AUTO_MODE = '⏵⏵ auto mode on (shift+tab to cycle)'
const HINT = { isDraft: false, isWorking: false, hint: AUTO_MODE }

type World = { usage: SessionUsage; branch: string; nextRequest: TurnUsage | null; clock: ReturnType<typeof mock.clock> }

const NOW = Date.UTC(2026, 9, 3, 22, 0)
const HOUR = 3_600_000
const inHours = (hours: number) => new Date(NOW + hours * HOUR).toISOString()

const request = (uncached: number, read: number, written: number): TurnUsage => ({
  model: 'claude-opus-5-5',
  input_tokens: uncached,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: written,
  output_tokens: 1200,
})

/** Stands in for the engine: its own hint line, the session's figures, git, and the model. */
function standInForEngine(on: On) {
  const world: World = {
    usage: { startedAt: 0, context: { tokens: 84250, window: 200000, percent: 42 }, rateLimits: [], cost: { usd: 1.2345 } },
    branch: 'main',
    nextRequest: null,
    clock: mock.clock(on, { now: NOW }),
  }

  mock.env(on, { HOME: '/home/xarillian' })
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.end', ($, e) => ({ sessionId: e.sessionId }))
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('session.cwd', () => ({ value: '/home/xarillian/.agents' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: world.usage }))
  on('process.run', () => ({
    value: { exitCode: 0, stdout: `${world.branch}\n`, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
  }))
  on('turn.step', async function* ($, e) {
    return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: world.nextRequest }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>{AUTO_MODE}</Text>
  })

  return world
}

async function startSession($: Engine, on: On) {
  const world = standInForEngine(on)
  await $.session.start({ cwd: '/home/xarillian/.agents', surface: 'terminal', isInteractive: true })
  return world
}

/** One model request of the main conversation (or a subagent's, given its id). */
async function modelAnswers($: Engine, world: World, usage: TurnUsage, agentId?: string) {
  world.nextRequest = usage
  const stream = $.turn.step({ turnId: 'turn', index: 0, model: 'claude-opus-5-5', effort: 'high', messageCount: 1, agentId })
  for await (const _ of stream);
  await stream.result
}

const typeCommand = ($: Engine, command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

async function footerOn($: Engine, surface: RenderSurface, columns = 120) {
  const footer = await $.ui.mount({
    plugin: 'w-footer',
    surface,
    component: 'PromptHint',
    props: HINT,
    viewport: { columns, rows: 40 },
  })
  const texts = (await footer.findAll({ type: 'Text' })).map(found => found.text)
  await footer.unmount()
  return texts.join('\n')
}

const withLimits = (world: World) => {
  world.usage = {
    ...world.usage,
    rateLimits: [
      { kind: 'seven_day', percentUsed: 23, resetsAt: inHours(6 * 24 + 4) },
      { kind: 'five_hour', percentUsed: 34, resetsAt: inHours(2.25) },
    ],
  }
}

describe('the footer under the prompt', () => {
  test('keeps the engine’s hint line, so the permission mode still shows', async ($, on) => {
    await startSession($, on)

    expect(await footerOn($, 'terminal')).toContain(AUTO_MODE)
  })

  test('shows where the session runs, home folded to ~, on which branch and model', async ($, on) => {
    await startSession($, on)

    expect(await footerOn($, 'terminal')).toContain('~/.agents · main · opus-5-5')
  })

  test('shows the context fill as a meter and a whole percentage', async ($, on) => {
    await startSession($, on)

    expect(await footerOn($, 'terminal')).toContain('▰▰▰▰▱▱▱▱▱▱ 42%')
  })

  test('shows what the session has cost, to the cent', async ($, on) => {
    await startSession($, on)

    expect(await footerOn($, 'terminal')).toContain('$1.23')
  })

  test('after the model answers, shows how much of the prompt the cache served', async ($, on) => {
    const world = await startSession($, on)

    await modelAnswers($, world, request(100, 9000, 900))

    expect(await footerOn($, 'terminal')).toContain('◈ 90%')
  })

  test('shows what remains of each rate-limit window, the session window first', async ($, on) => {
    const world = await startSession($, on)
    withLimits(world)

    expect(await footerOn($, 'terminal')).toContain('◆ 66% 77%')
  })

  test('without rate limits there is no limits figure', async ($, on) => {
    await startSession($, on)

    expect(await footerOn($, 'terminal')).not.toContain('◆')
  })

  test('a narrow terminal keeps the figures and gives up the place and model', async ($, on) => {
    const world = await startSession($, on)
    await modelAnswers($, world, request(100, 9000, 900))

    const footer = await footerOn($, 'terminal', 24)

    expect(footer).toContain('42%')
    expect(footer).toContain('$1.23')
    expect(footer).not.toContain('▰')
    expect(footer).not.toContain('opus-5-5')
  })

  test('/clear starts the ledger over', async ($, on) => {
    const world = await startSession($, on)
    await modelAnswers($, world, request(100, 9000, 900))

    await $.session.end({ reason: 'clear', sessionId: 'old', resume: { id: 'old' } })

    expect(await footerOn($, 'terminal')).not.toContain('◈')
  })

  test('on the desktop the engine draws its own hint', async ($, on) => {
    await startSession($, on)

    expect(await footerOn($, 'desktop')).toBe(AUTO_MODE)
  })
})

describe('the rate limits card', () => {
  test('names each window with what is left and when it resets', async ($, on) => {
    const world = await startSession($, on)
    withLimits(world)
    const footer = await footerOn($, 'terminal')

    expect(footer).toContain('session (5h)  66% left ↻ 2h15m')
    expect(footer).toContain('weekly (7d)   77% left ↻ 6d4h')
  })

  test('the reset countdown keeps time while the session sits idle', async ($, on) => {
    const world = await startSession($, on)
    withLimits(world)
    const footer = await $.ui.mount({ plugin: 'w-footer', surface: 'terminal', component: 'PromptHint', props: HINT })

    await world.clock.advance(HOUR)

    expect(await footer.find({ type: 'Text', text: 'session (5h)' })).toMatchObject({ text: 'session (5h)  66% left ↻ 1h15m' })
  })
})

describe('the cache card', () => {
  test('carries the tokens spent and what the cache read and stored', async ($, on) => {
    const world = await startSession($, on)

    await modelAnswers($, world, request(100, 9000, 900))

    expect(await footerOn($, 'terminal')).toContain('↑100 in  ↓1.2k out  9.0k read  900 stored')
  })

  test('waits behind the badge until /cache-history pins it', async ($, on) => {
    const world = await startSession($, on)
    await modelAnswers($, world, request(100, 9000, 900))

    await typeCommand($, 'cache-history')

    expect(await footerOn($, 'terminal')).toContain('Cache reuse · pinned')
  })

  test('charts the main conversation only', async ($, on) => {
    const world = await startSession($, on)
    await modelAnswers($, world, request(100, 9000, 900))
    await modelAnswers($, world, request(100, 0, 9000), 'subagent')

    expect(await footerOn($, 'terminal')).toContain('90.0% latest · 1 request')
  })

  test('a second /cache-history unpins it', async ($, on) => {
    const world = await startSession($, on)
    await modelAnswers($, world, request(100, 9000, 900))

    await typeCommand($, 'cache-history')
    await typeCommand($, 'cache-history')

    expect(await footerOn($, 'terminal')).not.toContain('pinned')
  })
})
