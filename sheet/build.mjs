// The progress sheet: `node sheet/build.mjs` renders sheet/index.html and sheet/board.json from
// sheet/data.json (what the cofounder maintains) and PLAN.md (the task register). The cofounder
// publishes index.html as the artifact and writes board.json to its database.
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
const dir = dirname(fileURLToPath(import.meta.url)) + '/'
const data = JSON.parse(readFileSync(dir + 'data.json', 'utf8'))
const plan = readFileSync(join(dir, '..', 'PLAN.md'), 'utf8')
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
const prLink = (s) =>
  esc(s).replace(/#(\d+)/g, (m, n) => `<a href="${data.repo}/pull/${n}">#${n}</a>`)

// The register is read from PLAN.md on main so it cannot drift from the plan.
const milestones = []
let current = null
for (const line of plan.split('\n')) {
  const m = line.match(/^## Milestone (\d+): (.+)$/)
  if (m) {
    current = { n: m[1], title: m[2], tasks: [], text: [] }
    milestones.push(current)
    continue
  }
  if (line.startsWith('## ')) {
    current = null
    continue
  }
  if (!current) continue
  if (line.startsWith('### ')) {
    current.group = line.slice(4).trim()
    continue
  }
  const row = line.match(/^\| ([A-Z]\d+) \| (.+) \|$/)
  if (row) {
    const cells = row[2].split(' | ')
    const last = cells[cells.length - 1].trim()
    const status = /^done/.test(last)
      ? 'done'
      : /^in progress/.test(last)
        ? 'in progress'
        : /^todo/.test(last)
          ? 'todo'
          : 'proposed'
    const bold = cells[0].match(/^\*\*(.+?)\*\*\s*(.*)$/)
    current.tasks.push({
      id: row[1],
      title: bold ? bold[1].replace(/\.$/, '') : cells[0],
      detail: bold ? bold[2] : '',
      deps: cells.length > 2 ? cells[1] : '',
      status,
      statusText: last,
      group: current.group ?? '',
    })
    continue
  }
  if (line.trim() && !line.startsWith('|')) current.text.push(line.trim())
}
const milestoneCounts = milestones.map((ms) => ({
  n: ms.n,
  title: ms.title,
  done: ms.tasks.filter((t) => t.status === 'done').length,
  total: ms.tasks.filter((t) => t.status !== 'proposed').length,
}))
const board = { ...data, milestones: milestoneCounts }
writeFileSync(dir + 'board.json', JSON.stringify(board, null, 2))

const pill = (t) => `<span class="pill ${t.status.replace(' ', '-')}">${t.status}</span>`
const taskRow = (t) =>
  `<tr><td class="id">${t.id}</td><td><strong>${inline(t.title)}</strong>${t.detail ? `<span class="detail">${inline(t.detail)}</span>` : ''}</td><td class="deps">${inline(t.deps || '–')}</td><td class="status">${pill(t)}<span class="detail">${prLink(t.statusText.replace(/^(done|todo|in progress),?\s*/, ''))}</span></td></tr>`
const register = milestones
  .map((ms) => {
    const c = milestoneCounts.find((x) => x.n === ms.n)
    const groups = [...new Set(ms.tasks.map((t) => t.group))]
    const tables = groups
      .map(
        (g) =>
          `${g ? `<h4>${esc(g)}</h4>` : ''}<div class="scroll"><table><thead><tr><th>Id</th><th>Task</th><th>Depends on</th><th>Status</th></tr></thead><tbody>${ms.tasks
            .filter((t) => t.group === g)
            .map(taskRow)
            .join('')}</tbody></table></div>`,
      )
      .join('')
    const text = ms.text.join(' ')
    return `<section class="milestone"><header><span class="eyebrow">Milestone ${ms.n}</span><h3>${esc(ms.title)}</h3><span class="count">${c.total ? `${c.done} of ${c.total} done` : 'outline only'}</span></header>${text ? `<p class="done-when">${inline(text)}</p>` : ''}${tables}</section>`
  })
  .join('')

const html = `<title>CDE.2 Progress Sheet</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
:root{--paper:#F5F6F2;--sheet:#FFFFFF;--ink:#1B1F23;--ink-2:#4B5157;--ink-3:#7A8087;--line:#CBCFC9;--line-2:#E3E6E0;--blue:#2453A6;--blue-soft:#E4EBF8;--green:#2E7D4F;--green-soft:#E1F0E6;--amber:#9A6A12;--amber-soft:#F8EDD1;--grey-soft:#ECEEEA;--violet:#6B4FA6;--violet-soft:#ECE6F7;--code:#EEF0EC}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--paper:#14171B;--sheet:#1C2025;--ink:#E7E9E4;--ink-2:#B4B9BF;--ink-3:#858B92;--line:#3A4048;--line-2:#2A2F35;--blue:#8DB0F0;--blue-soft:#20304A;--green:#7CC49A;--green-soft:#1F3A2B;--amber:#E2B45C;--amber-soft:#3E3115;--grey-soft:#262B31;--violet:#B7A3E6;--violet-soft:#2E2743;--code:#262B31}}
:root[data-theme="dark"]{--paper:#14171B;--sheet:#1C2025;--ink:#E7E9E4;--ink-2:#B4B9BF;--ink-3:#858B92;--line:#3A4048;--line-2:#2A2F35;--blue:#8DB0F0;--blue-soft:#20304A;--green:#7CC49A;--green-soft:#1F3A2B;--amber:#E2B45C;--amber-soft:#3E3115;--grey-soft:#262B31;--violet:#B7A3E6;--violet-soft:#2E2743;--code:#262B31}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.45 "IBM Plex Sans",system-ui,sans-serif;padding-block:16px;padding-inline:clamp(16px,3vw,32px)}
a{color:var(--blue);text-decoration:none}a:hover,a:focus-visible{text-decoration:underline;outline:none}
code{font:500 .85em "IBM Plex Mono",ui-monospace,monospace;background:var(--code);padding:1px 5px;border-radius:3px}
h1,h2,h3,h4{font-family:"Archivo","IBM Plex Sans",sans-serif;text-wrap:balance;margin:0}
.sheet{max-width:960px;margin:0 auto;background:var(--sheet);border:1.5px solid var(--ink)}
.titleblock{display:grid;grid-template-columns:1fr auto;gap:8px 16px;padding:12px 16px;border-bottom:1.5px solid var(--ink);align-items:end}
.titleblock h1{font-size:20px;font-weight:700}
.titleblock .rev{font:500 13px "IBM Plex Mono",monospace;color:var(--ink-3);text-align:right;font-variant-numeric:tabular-nums}
.eyebrow{display:block;font:600 11px/1.2 "Archivo",sans-serif;letter-spacing:.09em;text-transform:uppercase;color:var(--ink-3)}
.headline{margin:0;padding:12px 16px;font-size:16px;color:var(--ink-2);border-bottom:1px solid var(--line)}
.block{padding:12px 16px;border-bottom:1px solid var(--line)}
.block h2{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin-bottom:8px;display:flex;gap:8px;align-items:baseline}
.block h2 small{font:400 12px "IBM Plex Sans",sans-serif;letter-spacing:0;text-transform:none;color:var(--ink-3)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:0}
.two>.block:first-child{border-right:1px solid var(--line)}
.decide{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.decide li{border:1px solid var(--amber);background:var(--amber-soft);padding:10px 12px;display:grid;gap:8px}
.decide li.decided{border-color:var(--line);background:var(--sheet)}
.decide .text{font-size:14.5px}
.actions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
button{font:600 13px "Archivo",sans-serif;letter-spacing:.02em;padding:8px 14px;border-radius:3px;border:1.5px solid var(--ink);background:var(--ink);color:var(--sheet);cursor:pointer;min-height:36px}
button.quiet{background:transparent;color:var(--ink)}
button:focus-visible{outline:2px solid var(--blue);outline-offset:2px}
button:disabled{opacity:.5;cursor:default}
.state{font:500 13px "IBM Plex Mono",monospace;color:var(--green)}
.state.hold{color:var(--amber)}
.yours{margin:0;padding:0;list-style:none;display:grid;gap:4px;font-size:14px;color:var(--ink-2)}
.yours li::before{content:"";display:inline-block;width:8px;height:8px;border:1.5px solid var(--ink-3);margin-right:8px;vertical-align:1px}
.lanes{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.lane{display:grid;grid-template-columns:minmax(150px,1fr) minmax(200px,2fr);gap:6px 12px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line-2)}
.lane:last-child{border-bottom:0}
.lane .who{display:grid;gap:2px}
.lane .who strong{font-family:"Archivo",sans-serif;font-size:15px}
.lane .meta{font-size:12px;color:var(--ink-3)}
.id{font:500 11.5px "IBM Plex Mono",monospace;color:var(--blue);background:var(--blue-soft);padding:2px 6px;border-radius:2px;white-space:nowrap;margin-right:6px}
.track{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,1fr);position:relative}
.track::before{content:"";position:absolute;left:10%;right:10%;top:6px;height:1.5px;background:var(--line)}
.track li{display:grid;justify-items:center;gap:4px;font-size:10.5px;color:var(--ink-3);text-align:center;position:relative}
.track li i{width:13px;height:13px;border-radius:50%;border:1.5px solid var(--line);background:var(--sheet);display:block}
.track li.past i{background:var(--green);border-color:var(--green)}
.track li.now i{background:var(--blue);border-color:var(--blue);box-shadow:0 0 0 3px var(--blue-soft)}
.track li.now{color:var(--blue);font-weight:500}
.list{margin:0;padding-left:18px;display:grid;gap:4px;font-size:14px}
.bars{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.bars li{display:grid;grid-template-columns:28px 1fr 120px 40px;gap:10px;align-items:center;font-size:13px}
.bars .bar{height:7px;background:var(--grey-soft);border:1px solid var(--line);position:relative}
.bars .bar i{position:absolute;inset:0;right:auto;background:var(--green)}
.bars .num{font:500 12px "IBM Plex Mono",monospace;text-align:right;font-variant-numeric:tabular-nums}
.note{display:grid;gap:8px}
.note textarea{font:14px "IBM Plex Sans",sans-serif;padding:8px 10px;border:1px solid var(--line);background:var(--sheet);color:var(--ink);border-radius:3px;min-height:56px;resize:vertical;width:100%}
.note textarea:focus-visible{outline:2px solid var(--blue);outline-offset:1px}
.sent{list-style:none;margin:0;padding:0;display:grid;gap:4px;font-size:13px;color:var(--ink-2)}
.sent .when{font:500 11.5px "IBM Plex Mono",monospace;color:var(--ink-3);margin-right:8px}
.offline{font-size:12.5px;color:var(--ink-3)}
details{border-top:1.5px solid var(--ink)}
summary{cursor:pointer;padding:12px 16px;font:700 12px "Archivo",sans-serif;letter-spacing:.08em;text-transform:uppercase;list-style:none;display:flex;justify-content:space-between}
summary::after{content:"open";font:400 12px "IBM Plex Sans",sans-serif;letter-spacing:0;text-transform:none;color:var(--ink-3)}
details[open] summary::after{content:"close"}
.register{padding:0 16px 16px}
.milestone{margin-top:18px}
.milestone header{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 12px;border-bottom:1.5px solid var(--ink);padding-bottom:5px}
.milestone h3{font-size:17px}
.milestone .count{font:500 12px "IBM Plex Mono",monospace;color:var(--ink-3);margin-left:auto}
.done-when{font-size:13px;color:var(--ink-2);max-width:72ch;margin:8px 0 2px}
.milestone h4{font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3);margin:14px 0 4px}
.scroll{overflow-x:auto}
table{border-collapse:collapse;width:100%;font-size:13px}
th{text-align:left;font:600 10.5px/1.2 "Archivo",sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);padding:6px 8px;border-bottom:1px solid var(--line)}
td{padding:7px 8px;border-bottom:1px solid var(--line-2);vertical-align:top}
td.id{width:40px}td.deps{white-space:nowrap;color:var(--ink-2);font:400 12px "IBM Plex Mono",monospace}td.status{width:180px}
.detail{display:block;font-size:12.5px;color:var(--ink-2)}
.pill{display:inline-block;font:600 10px/1 "Archivo",sans-serif;letter-spacing:.07em;text-transform:uppercase;padding:4px 6px;border-radius:2px;margin-bottom:3px}
.pill.done{background:var(--green-soft);color:var(--green)}.pill.in-progress{background:var(--blue-soft);color:var(--blue)}.pill.todo{background:var(--grey-soft);color:var(--ink-2)}.pill.proposed{background:var(--violet-soft);color:var(--violet)}
.foot{padding:10px 16px;font-size:12px;color:var(--ink-3);border-top:1px solid var(--line)}
@media (max-width:640px){.titleblock{grid-template-columns:1fr}.titleblock .rev{text-align:left}.two{grid-template-columns:1fr}.two>.block:first-child{border-right:0}.lane{grid-template-columns:1fr}.bars li{grid-template-columns:28px 1fr 70px 40px}}
@media (prefers-reduced-motion:no-preference){.track li.now i{transition:background .3s}}
</style>
<div class="sheet">
  <div class="titleblock"><div><span class="eyebrow">Progress sheet</span><h1>Conceptual Design Engine, CDE.2</h1></div><div class="rev" id="rev"></div></div>
  <p class="headline" id="headline"></p>
  <div class="block"><h2>Decide <small id="decide-hint">tap once; the cofounder picks it up within the hour</small></h2><ul class="decide" id="decide"></ul></div>
  <div class="block"><h2>Agents at work</h2><ul class="lanes" id="agents"></ul></div>
  <div class="two">
    <div class="block"><h2>Done this session</h2><ol class="list" id="done"></ol></div>
    <div class="block"><h2>Next, in order</h2><ol class="list" id="next"></ol></div>
  </div>
  <div class="two">
    <div class="block"><h2>Yours to do</h2><ul class="yours" id="yours"></ul></div>
    <div class="block"><h2>Milestones</h2><ul class="bars" id="bars"></ul></div>
  </div>
  <div class="block note"><h2>Note for the cofounder <small>read at the next check-in</small></h2><textarea id="note-text" placeholder="Send A6 back: the rotation handle is too small."></textarea><div class="actions"><button type="button" id="note-send">Send</button><span class="offline" id="note-state"></span></div><ul class="sent" id="notes"></ul></div>
  <details><summary>Full task register</summary><div class="register">${register}</div></details>
  <div class="foot">Register read from <a href="${data.repo}/blob/main/PLAN.md">PLAN.md</a> on main when the sheet was built. Everything above it updates live.</div>
</div>
<script>
const embedded = ${JSON.stringify(board)}
const repo = embedded.repo
let board = embedded, decisions = {}, notes = [], db = null
const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const pr = (s) => esc(s).replace(/#(\\d+)/g, (m, n) => '<a href="' + repo + '/pull/' + n + '">#' + n + '</a>')
const when = (iso) => { const d = new Date(iso); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) }
function render() {
  $('rev').textContent = 'Rev ' + board.revision + ' · ' + board.session + ' · ' + board.date
  $('headline').textContent = board.headline
  const items = board.decide.filter((d) => !(decisions[d.id] && decisions[d.id].handled))
  $('decide').innerHTML = items.length ? items.map((d) => {
    const dec = decisions[d.id]
    const state = dec ? '<span class="state ' + (dec.decision === 'hold' ? 'hold' : '') + '">' + (dec.decision === 'approve' ? 'Approved' : 'On hold') + ' · ' + when(dec.at) + '</span><button type="button" class="quiet" data-undo="' + d.id + '">Undo</button>'
      : '<button type="button" data-approve="' + d.id + '">Approve</button><button type="button" class="quiet" data-hold="' + d.id + '">Hold</button>'
    return '<li class="' + (dec ? 'decided' : '') + '"><span class="text">' + pr(d.text) + '</span><div class="actions">' + state + '</div></li>'
  }).join('') : '<li class="decided"><span class="text">Nothing waits on you.</span></li>'
  $('agents').innerHTML = board.agents.map((a) => '<li class="lane"><div class="who"><span><span class="id">' + a.task + '</span><strong>' + esc(a.name) + '</strong></span><span class="meta">' + esc(a.model) + (a.pr ? ' · <a href="' + repo + '/pull/' + a.pr + '">PR #' + a.pr + '</a>' : '') + '</span></div><ol class="track">' + board.stages.map((s, i) => '<li class="' + (i < a.stage ? 'past' : i === a.stage ? 'now' : '') + '"><i></i><span>' + esc(s) + '</span></li>').join('') + '</ol></li>').join('')
  $('done').innerHTML = board.done.map((t) => '<li>' + pr(t) + '</li>').join('')
  $('next').innerHTML = board.next.map((t) => '<li>' + pr(t) + '</li>').join('')
  $('yours').innerHTML = board.yours.map((y) => '<li>' + esc(y.text) + '</li>').join('')
  $('bars').innerHTML = board.milestones.map((m) => '<li><span class="id">M' + m.n + '</span><span>' + esc(m.title) + '</span><span class="bar"><i style="width:' + (m.total ? Math.round(100 * m.done / m.total) : 0) + '%"></i></span><span class="num">' + (m.total ? m.done + '/' + m.total : '–') + '</span></li>').join('')
  $('notes').innerHTML = notes.map((n) => '<li><span class="when">' + when(n.at) + '</span>' + esc(n.text) + (n.read ? ' <span class="state">· read</span>' : '') + '</li>').join('')
  const live = !!db
  document.querySelectorAll('#decide button, #note-send').forEach((b) => { b.disabled = !live })
  $('decide-hint').textContent = live ? 'tap once; the cofounder picks it up within the hour' : 'buttons work inside claude.ai'
  $('note-state').textContent = live ? '' : 'Notes need claude.ai.'
}
render()
$('decide').addEventListener('click', async (event) => {
  const b = event.target.closest('button'); if (!b || !db) return
  const id = b.dataset.approve || b.dataset.hold || b.dataset.undo
  const item = board.decide.find((d) => d.id === id)
  try {
    if (b.dataset.undo) await db.doc('decisions/' + id).delete()
    else await db.doc('decisions/' + id).set({ itemId: id, decision: b.dataset.approve ? 'approve' : 'hold', label: item ? item.text : id, at: new Date().toISOString(), handled: false })
  } catch (e) { $('decide-hint').textContent = 'Could not save: ' + (e && e.message ? e.message : 'try again') }
})
$('note-send').addEventListener('click', async () => {
  const text = $('note-text').value.trim(); if (!text || !db) return
  try { await db.collection('notes').add({ text, at: new Date().toISOString(), read: false }); $('note-text').value = ''; $('note-state').textContent = 'Sent.' }
  catch (e) { $('note-state').textContent = 'Could not send: ' + (e && e.message ? e.message : 'try again') }
})
;(async () => {
  if (!window.claude || !window.claude.use) return
  db = await window.claude.use('db'); if (!db) return
  render()
  db.doc('board/current').onSnapshot((s) => { if (s.exists) { board = s.data(); render() } }, () => {})
  db.collection('decisions').onSnapshot((s) => { decisions = {}; s.docs.forEach((d) => { decisions[d.id] = d.data() }); render() }, () => {})
  db.collection('notes').orderBy('at', 'desc').limit(8).onSnapshot((s) => { notes = s.docs.map((d) => d.data()); render() }, () => {})
})()
</script>
`
writeFileSync(dir + 'index.html', html)
process.stdout.write(
  'built ' + milestoneCounts.map((m) => m.n + ':' + m.done + '/' + m.total).join(' ') + '\n',
)
