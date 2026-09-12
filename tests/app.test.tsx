import { renderToStaticMarkup } from 'react-dom/server'
import { expect, it } from 'vitest'
import { App } from '../src/App'

it('shows the name of the tool', () => {
  expect(renderToStaticMarkup(<App />)).toContain('Conceptual Design Engine')
})
