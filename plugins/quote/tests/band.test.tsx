import { describe, expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const

const BAND = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 30,
  bodyColumns: 80,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

type Screen = { highlight?: string; draft: string; cursor: number; sent: string[]; replies: string[] }

/** Stands in for the engine: what is highlighted, what the prompt holds, and what was sent. */
function standInForEngine(on: On) {
  const screen: Screen = { draft: '', cursor: 0, sent: [], replies: [] }

  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('session.messages', () => ({
    value: screen.replies.map(text => ({ role: 'assistant' as const, text, toolUses: [] })),
  }))
  on('prompt.submit', ($, e) => {
    screen.sent.push(e.text)
    return { text: e.text }
  })
  on('ui.selection', () => ({ value: screen.highlight === undefined ? undefined : { text: screen.highlight } }))
  on('prompt.read', () => ({ value: { text: screen.draft, cursor: screen.cursor } }))
  on('prompt.fill', ($, e) => {
    screen.draft = screen.draft.slice(0, screen.cursor) + e.text + screen.draft.slice(screen.cursor)
    screen.cursor += e.text.length
    return { isFilled: true }
  })
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })

  return screen
}

type Session = { $: Engine; clock: ReturnType<typeof mock.clock>; screen: Screen; surface: RenderSurface }

async function startSession($: Engine, on: On, surface: RenderSurface): Promise<Session> {
  const clock = mock.clock(on)
  const screen = standInForEngine(on)
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  return { $, clock, screen, surface }
}

const mountBand = ({ $, surface }: Session) =>
  $.ui.mount({ plugin: 'quote', surface, component: 'AbovePrompt', props: BAND })

async function highlight(session: Session, text: string | undefined) {
  session.screen.highlight = text
  await session.clock.advance(400)
}

/** Highlights text, then clicks Quote on the band, as the person does with the mouse. */
async function quote(session: Session, text: string) {
  await highlight(session, text)
  const band = await mountBand(session)
  await band.press({ key: 'quote' })
  await band.unmount()
}

/** Puts words in the prompt as if typed, with the cursor left at their end. */
function type(session: Session, text: string) {
  session.screen.draft = text
  session.screen.cursor = text.length
}

const send = ({ $ }: Session, text: string) => $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

const shown = async (session: Session) => {
  const band = await mountBand(session)
  const texts = (await band.findAll({ type: 'Text' })).map(found => found.text)
  await band.unmount()
  return texts
}

for (const surface of SURFACES) {
  describe(`writing a reply on the ${surface}`, () => {
    test('highlighting text offers to quote it', async ($, on) => {
      const session = await startSession($, on, surface)
      await highlight(session, 'source has three producers and zero consumers.')

      expect(await shown(session)).toContain('source has three producers and zero consumers.')
    })

    test('with nothing highlighted and nothing quoted the band is the engine’s', async ($, on) => {
      const session = await startSession($, on, surface)
      await highlight(session, undefined)

      expect(await shown(session)).toEqual(['engine'])
    })

    test('quoting puts the highlight at the cursor as its own paragraph', async ($, on) => {
      const session = await startSession($, on, surface)
      type(session, 'two things first:')

      await quote(session, 'source has three producers.')

      expect(session.screen.draft).toBe('two things first:\n\n> source has three producers.\n\n')
    })

    test('sending leaves the message as typed', async ($, on) => {
      const session = await startSession($, on, surface)
      await quote(session, 'source has three producers.')

      await send(session, '> source has three producers.\n\new, drop it\n\nalso, how is the build?')

      expect(session.screen.sent).toEqual(['> source has three producers.\n\new, drop it\n\nalso, how is the build?'])
    })

    test('a highlight cut from the middle of a reply is quoted with ellipses where it was cut', async ($, on) => {
      const session = await startSession($, on, surface)
      session.screen.replies = ['source has three producers and zero consumers.']

      await quote(session, 'three producers')

      expect(session.screen.draft).toBe('> …three producers…\n\n')
    })

    test('a quoted highlight is not offered again', async ($, on) => {
      const session = await startSession($, on, surface)
      await quote(session, 'quoted once')

      await session.clock.advance(2000)

      expect(await shown(session)).not.toContain('❝')
    })

    test('dismissing drops the offer', async ($, on) => {
      const session = await startSession($, on, surface)
      await highlight(session, 'not this one')
      const band = await mountBand(session)

      await band.press({ key: 'dismiss' })

      expect(await band.drawn()).toMatchObject({ children: ['engine'] })
    })

    test('an offer left alone expires, since a click away leaves no trace the mod can see', async ($, on) => {
      const session = await startSession($, on, surface)
      await highlight(session, 'left alone')
      expect(await shown(session)).toContain('left alone')

      await session.clock.advance(9000)

      expect(await shown(session)).toEqual(['engine'])
    })

    test('clearing the highlight withdraws the offer', async ($, on) => {
      const session = await startSession($, on, surface)
      await highlight(session, 'gone soon')
      await highlight(session, undefined)

      expect(await shown(session)).toEqual(['engine'])
    })

    test('text highlighted inside the prompt itself is editing, not quoting', async ($, on) => {
      const session = await startSession($, on, surface)
      session.screen.draft = 'please fix the eviction scan'

      await highlight(session, 'eviction scan')

      expect(await shown(session)).toEqual(['engine'])
    })
  })
}
