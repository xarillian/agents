import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionRateLimit } from 'claude-code'

import { footer } from './footer.js'
import { EMPTY_LEDGER, record } from './ledger.js'
import { cooldownResetAt } from './limits.js'

type CooldownCache = { checked: boolean; resetAt: number; at: number }

const ledger = atom({ plugin: 'footer', key: 'ledger' } as const, EMPTY_LEDGER)
const branch = atom({ plugin: 'footer', key: 'branch' } as const, null as string | null)
const isPinned = atom({ plugin: 'footer', key: 'isPinned' } as const, false)

const COUNTDOWN_TICK_MS = 60_000
const COOLDOWN_DRIFT_MS = 60_000
const COOLDOWN_HEARTBEAT_MS = 300_000

// In-memory cache per terminal: ui.render cannot persist atom updates across renders.
const reportedCooldowns = new Map<string, CooldownCache>()

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    reportedCooldowns.clear()
    await $.command.register({
      name: 'cache-history',
      description: 'Toggle the cache reuse graph for this conversation',
    })
    await refreshBranch($)
    $.clock.every(COUNTDOWN_TICK_MS, () => $.ui.invalidate('ui.render'))

    return next(e)
  })

  on('command.run', { command: 'cache-history' }, async $ => {
    await update($, isPinned, pinned => !pinned)

    return {}
  })

  on('turn.step', async function* ($, e, next) {
    const step = yield* next(e)
    const usage = step.usage
    if (usage) await update($, ledger, totals => record(totals, usage, e.agentId === undefined))

    return step
  })

  on('turn.complete', async ($, e, next) => {
    await refreshBranch($)
    const [usage, now] = await Promise.all([$.session.usage(), $.clock.now()])
    await syncHerdrCooldown($, usage.rateLimits, now)

    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') await update($, ledger, () => EMPTY_LEDGER)

    return next(e)
  })

  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.surface !== 'terminal') return next(e)

    const hint = await next(e)
    const [usage, model, cwd, home, now] = await Promise.all([
      $.session.usage(),
      $.session.model(),
      $.session.cwd(),
      $.env.get('HOME'),
      $.clock.now(),
    ])
    await syncHerdrCooldown($, usage.rateLimits, now)

    return footer(
      $.ui.resolve(e),
      hint,
      {
        cwd,
        home,
        branch: await read($, branch),
        model,
        context: usage.context,
        ledger: await read($, ledger),
        cost: usage.cost?.usd ?? 0,
        rateLimits: usage.rateLimits,
        now,
        isPinned: await read($, isPinned),
      },
      e.viewport?.columns ?? 80,
    )
  })
}

/** Publishes quota exhaustion to Herdr via terminal labels when running inside hc. */
async function syncHerdrCooldown($: EngineInterface, rateLimits: readonly SessionRateLimit[], now: number) {
  const terminalId = (await $.env.get('HC_TERMINAL_ID'))?.trim()
  if (!terminalId) return

  const resetAt = cooldownResetAt(rateLimits, now)
  const checked = resetAt !== undefined
  const nextReset = resetAt ?? 0
  const prev = reportedCooldowns.get(terminalId) ?? null
  if (!shouldPublishCooldown(prev, checked, nextReset, now)) return

  const args = ['hc', 'label', terminalId, 'usage.pool=claude']
  if (checked) {
    args.push(`usage.cooldown=${nextReset > 0 ? String(nextReset) : ''}`)
    args.push(`usage.at=${String(now)}`)
  }

  try {
    const { exitCode } = await $.process.run(args)
    if (exitCode === 0) reportedCooldowns.set(terminalId, { checked, resetAt: nextReset, at: now })
  } catch {
    // Ignore when hc is unavailable.
  }
}

function shouldPublishCooldown(prev: CooldownCache | null, checked: boolean, resetAt: number, now: number): boolean {
  if (!prev) return true
  if (!checked) return false
  if (!prev.checked) return true
  if ((prev.resetAt > 0) !== (resetAt > 0)) return true
  if (resetAt > 0 && Math.abs(resetAt - prev.resetAt) >= COOLDOWN_DRIFT_MS) return true
  return now - prev.at >= COOLDOWN_HEARTBEAT_MS
}

/** A turn's commands may have switched branches, so the branch is read again after each. */
async function refreshBranch($: EngineInterface) {
  const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'])
  const name = stdout.trim()
  await update($, branch, () => (exitCode === 0 && name ? name : null))
}
