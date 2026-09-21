/**
 * The drawings: each task's sheet before the architect touched it and after its first run, loaded
 * into the built app through browser storage and photographed on the Sheet tab.
 *
 *   node course/shot.mjs [--only t11-three-moves,t12-setback]
 */

import { register } from 'node:module'
import { createServer } from 'node:http'
import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

register('./ts-resolve.mjs', import.meta.url)

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dist = join(root, 'dist')
const results = join(here, 'results')

const { sheetKept } = await import('../src/views/sheet/store.ts')
const { TASKS } = await import('./tasks.mjs')
const { readState, replay } = await import('./run.mjs')
const { chromium } = await import('@playwright/test')

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
}

/** The built app, served from disk: the page loads from any path, so a bare host is enough. */
const serve = () =>
  new Promise((ready) => {
    const server = createServer((request, answer) => {
      const asked = decodeURIComponent((request.url ?? '/').split('?')[0])
      const file = join(dist, asked === '/' ? 'index.html' : asked.replace(/^\/+/, ''))
      const path = existsSync(file) && extname(file) ? file : join(dist, 'index.html')
      answer.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/plain' })
      createReadStream(path).pipe(answer)
    })
    server.listen(0, '127.0.0.1', () => ready({ server, port: server.address().port }))
  })

async function shoot(page, port, sheet, file) {
  const kept = sheetKept(sheet)
  await page.addInitScript((stored) => {
    window.localStorage.setItem('cde.sheet', JSON.stringify(stored))
  }, kept)
  await page.goto(`http://127.0.0.1:${port}/`)
  await page.locator('nav.tabs').getByRole('button', { name: 'Sheet', exact: true }).click()
  await page.locator('svg.sheet').waitFor()
  await page.waitForTimeout(400)
  await page.locator('svg.sheet').screenshot({ path: file })
}

if (!existsSync(join(dist, 'index.html'))) throw new Error('build the app first: npm run build')
mkdirSync(results, { recursive: true })
const { server, port } = await serve()
const browser = await chromium.launch()
const asked = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1].split(',')
  : null
for (const task of TASKS.filter((t) => !asked || asked.includes(t.key))) {
  const state = readState(task.key, 1)
  const after = replay(task, state.calls).sheet()
  for (const [when, sheet] of [
    ['before', task.sheet()],
    ['after', after],
  ]) {
    const page = await browser.newPage({ viewport: { width: 1200, height: 900 } })
    await shoot(page, port, sheet, join(results, `${task.key}-${when}.png`))
    await page.close()
    process.stdout.write(`${task.key} ${when}\n`)
  }
}
await browser.close()
server.close()
