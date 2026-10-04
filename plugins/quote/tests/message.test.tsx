import { describe, expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'
import type { On, RenderSurface } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const

const SENT = "> source has three producers and zero consumers.\n\new, drop it"

function standInForEngine(on: On) {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    return <Text>engine</Text>
  })
}

const mountMessage = ($: Engine, surface: RenderSurface, text: string, from?: { name: string }) =>
  $.ui.mount({
    plugin: 'quote',
    surface,
    component: 'UserMessage',
    props: { text, origin: { kind: 'composer' }, isExpanded: true, ...(from ? { from } : {}) },
  })

for (const surface of SURFACES) {
  describe(`a sent message on the ${surface}`, () => {
    test('a quote becomes a card labelled Claude, with the comment hung under it', async ($, on) => {
      standInForEngine(on)
      const message = await mountMessage($, surface, SENT)
      const texts = await message.findAll({ type: 'Text' })

      expect(texts.find(found => found.text === 'source has three producers and zero consumers.')?.props).toMatchObject({
        italic: true,
      })
      expect(texts.some(found => found.text === ' Claude ')).toBe(true)
      expect(texts.map(found => found.text)).toEqual(expect.arrayContaining(['↳ ', 'ew, drop it']))
    })

    test('each reply line is inset two columns without moving the quote card', async ($, on) => {
      standInForEngine(on)
      const message = await mountMessage($, surface, '> hello\n\nfirst line\nsecond line')
      const boxes = await message.findAll({ type: 'Box' })
      const insetRows = boxes.filter(found => found.props.marginLeft === 2)

      expect(insetRows).toHaveLength(2)
      expect(insetRows.map(found => found.text)).toEqual(['↳ first line', '  second line'])
      expect(boxes.find(found => found.props.borderStyle === 'round')?.props.marginLeft).toBeUndefined()
    })

    test('a message without quotes is drawn by the engine', async ($, on) => {
      standInForEngine(on)

      expect(await (await mountMessage($, surface, 'just a thought')).drawn()).toMatchObject({ children: ['engine'] })
    })

    test("another agent's message is left to the engine", async ($, on) => {
      standInForEngine(on)

      expect(await (await mountMessage($, surface, SENT, { name: 'scout' })).drawn()).toMatchObject({
        children: ['engine'],
      })
    })
  })
}
