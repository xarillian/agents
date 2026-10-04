import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { footer } from './footer.tsx'
import { EMPTY_LEDGER, record } from './ledger.ts'

const ledger = atom({ plugin: 'w-footer', key: 'ledger' } as const, EMPTY_LEDGER)
const branch = atom({ plugin: 'w-footer', key: 'branch' } as const, null as string | null)
const isPinned = atom({ plugin: 'w-footer', key: 'isPinned' } as const, false)

const COUNTDOWN_TICK_MS = 60_000

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
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

/** A turn's commands may have switched branches, so the branch is read again after each. */
async function refreshBranch($: EngineInterface) {
  const { exitCode, stdout } = await $.process.run(['git', 'branch', '--show-current'])
  const name = stdout.trim()
  await update($, branch, () => (exitCode === 0 && name ? name : null))
}
