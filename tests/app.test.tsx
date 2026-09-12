// @vitest-environment jsdom
import { createRoot } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { act } from 'react-dom/test-utils'
import { expect, it } from 'vitest'
import { App } from '../src/App'
import { session } from '../src/app/session'

it('shows the name of the tool', () => {
  expect(renderToStaticMarkup(<App />)).toContain('Conceptual Design Engine')
})

it('never resizes the main area when a refusal arrives, however many pile up', () => {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => root.render(<App />))

  const main = container.querySelector('main')
  if (!main) throw new Error('the shell has no main element')
  const before = { html: main.innerHTML, height: main.getBoundingClientRect().height }

  act(() => {
    session.say('First refusal.')
    session.say('Second refusal.')
    session.say('Third refusal.')
  })

  // The stack sits over the corner, not in main's flow, so main's content and box are untouched.
  expect(main.innerHTML).toBe(before.html)
  expect(main.getBoundingClientRect().height).toBe(before.height)

  act(() => root.unmount())
  container.remove()
  for (const message of session.messages()) session.dismiss(message.id)
})
