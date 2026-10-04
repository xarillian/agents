import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import { withEllipses } from './ellipsis.ts'
import { hasQuote, quoteAt, quoteDecorations } from './quote.ts'
import { offer, quotedMessage } from './view.tsx'

const CHECK_MS = 300
const OFFER_MS = 8000
const REPLIES_SEARCHED = 10

const seen = atom({ plugin: 'quote', key: 'seen' } as const, null as string | null)
const offered = atom({ plugin: 'quote', key: 'offered' } as const, null as string | null)

let offeredAt = 0

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    $.clock.every(CHECK_MS, () => void checkSelection($))

    return next(e)
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, offered, () => null)

    return next(e)
  })

  on('prompt.edit', async ($, e, next) => {
    const edited = await next(e)
    await update($, offered, () => null)

    return { ...edited, decorations: [...(edited.decorations ?? []), ...quoteDecorations(edited.text)] }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const selection = await read($, offered)
    if (selection === null || e.props.hasSurvey || e.surface === 'mobile') return next(e)

    return offer($.ui.resolve(e), selection, {
      quote: () => quoteAtCursor($),
      dismiss: () => update($, offered, () => null),
    })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const isOwnMessage = e.props.task === undefined && e.props.from === undefined
    if (!isOwnMessage || e.surface === 'mobile' || !hasQuote(e.props.text)) return next(e)

    return quotedMessage($.ui.resolve(e), e.props.text)
  })
}

/**
 * The engine says what was last highlighted, and keeps saying it after a click
 * or Esc has cleared the highlight from the screen. So a selection is offered
 * once, withdrawn when typing takes the highlight down, and otherwise left to
 * expire. Text already in the draft is the person editing, not quoting.
 */
async function checkSelection($: EngineInterface) {
  const text = (await $.ui.selection())?.text.trim() || null
  if (text === (await read($, seen))) return expireOffer($)

  await update($, seen, () => text)
  if (text === null) return update($, offered, () => null)

  const prompt = await $.prompt.read()
  if (prompt.text.includes(text)) return

  offeredAt = await $.clock.now()
  await update($, offered, () => text)
}

async function expireOffer($: EngineInterface) {
  if ((await read($, offered)) !== null && (await $.clock.now()) - offeredAt > OFFER_MS) {
    await update($, offered, () => null)
  }
}

async function quoteAtCursor($: EngineInterface) {
  const selection = await read($, offered)
  if (selection === null) return

  const quote = withEllipses(selection, await recentReplies($))
  const prompt = await $.prompt.read()
  const insertion = quoteAt(prompt.text.slice(0, prompt.cursor), quote)
  const filled = await $.prompt.fill({ text: insertion, mode: 'insert', decorations: quoteDecorations(insertion) })
  if (filled.isFilled) await update($, offered, () => null)
}

async function recentReplies($: EngineInterface) {
  const messages = await $.session.messages()
  if (!Array.isArray(messages)) return []

  return messages
    .filter(message => message.role === 'assistant' && message.text.trim() !== '')
    .slice(-REPLIES_SEARCHED)
    .map(message => message.text)
    .reverse()
}
