import WebSocket from 'ws'

const KEY = process.env.DM_KEY
const open = (role, extra = {}) => new Promise(res => {
  const ws = new WebSocket('ws://localhost:8080/ws')
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room: 'table', role, ...extra })))
  const msgs = []
  ws.on('message', d => { msgs.push(JSON.parse(String(d))); if (msgs.length === 2) res({ ws, msgs }) })
})

const dm = await open('dm', { dmKey: KEY })
const table = await open('table')
const emeric = await open('personal', { audience: 'emeric' })

const latest = c => [...c.msgs].reverse().find(m => m.t === 'update')?.update.world
const wait = ms => new Promise(r => setTimeout(r, ms))

// 1. The mimic has no reveal flags at all. It must be absent everywhere.
const gnomen = latest(table)
console.log('scene shown to table:', gnomen.scenes.find(s => s.id === gnomen.presented)?.name)
console.log('world role:', gnomen.role, '| has secrets key:', 'secrets' in gnomen)

dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'dmScene', scene: 'gnomengarde' } }))
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'present', audience: 'table', scene: 'gnomengarde' } }))
await wait(120)

const g = latest(table)
const sc = g.scenes.find(s => s.id === g.presented)
const names = sc.tokens.map(t => t.name)
console.log('tokens the table can see:', JSON.stringify(names))
const blob = JSON.stringify(g)

const forbidden = [
  ['monster tactics (dm group)', 'Adhesive'],
  ['npc truth (dm group)', 'Zhentarim'],
  ['unidentified monster name', 'Mimic'],
  ['scene prep', 'answers the question asked'],
  ['clock dm text', 'Do not explain it'],
  ['object truth (dm group)', 'Gnerkli cut it'],
  ['monster narration', 'far too many teeth'],
  ['scene cue', 'barred from this side'],
  ['quest dm text', 'Adhesive on the paladin'],
  ['unplaced bestiary actor', 'Cryovain'],
  ['scene checks', 'grain of the wood does not run'],
  ['player options', 'Separate Gnerkli'],
  ['item secret', 'Do not point at it'],
]
let leaks = 0
for (const [label, needle] of forbidden) {
  const hit = blob.includes(needle)
  if (hit) leaks++
  console.log(`  ${hit ? 'LEAK' : 'ok  '}  ${label}`)
}

// 2. Reveal presence only. The token appears, unnamed.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'table', targets: ['gnomengarde.mon.mimic#presence'] } }))
await wait(120)
const g2 = latest(table)
const mimic = g2.scenes.find(s => s.id === g2.presented).tokens.find(t => t.id === 'gnomengarde.mon.mimic')
console.log('\nafter revealing presence only:')
console.log('  present:', !!mimic, ' name:', JSON.stringify(mimic?.name), ' hp:', JSON.stringify(mimic?.hp))
console.log('  entries on wire:', JSON.stringify(mimic?.entries ?? []))

// 3. Per-audience: reveal a fact to Emeric only. He follows the table's scene.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'emeric', targets: ['fact.missing#presence'] } }))
await wait(120)
const cur = w => w.scenes.find(s => s.id === w.presented)
const tableFacts = cur(latest(table)).entries.map(f => f.id)
const emericFacts = cur(latest(emeric))?.entries.map(f => f.id) ?? []
console.log('\nper-audience reveal:')
console.log('  table sees: ', JSON.stringify(tableFacts))
console.log('  emeric sees:', JSON.stringify(emericFacts))

// 4. Undo.
dm.ws.send(JSON.stringify({ t: 'undo' }))
await wait(120)
console.log('\nafter undo, emeric sees:', JSON.stringify(cur(latest(emeric))?.entries.map(f => f.id) ?? []))

// 4b. A campaign-declared group: reveal monster lore to Emeric alone.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'table', targets: ['gnomengarde.mon.mimic#lore'] } }))
await wait(120)
const tEntries = cur(latest(table)).tokens.find(t => t.id === 'gnomengarde.mon.mimic')?.entries ?? []
console.log('\ncampaign-declared group "lore" revealed to table:')
console.log('  table entry ids:', JSON.stringify(tEntries.map(e => e.id)))
if (JSON.stringify(tEntries).includes('Adhesive')) { console.log('  LEAK: dm-group entry rode along'); leaks++ }
else console.log('  ok    dm-group entries did not ride along')

// 4c. Runtime placement: drop a bestiary actor onto the map, then move it.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'place', actor: 'mon.orc', scene: 'gnomengarde', x: 0.2, y: 0.2 } }))
await wait(120)
let placedId = null
{
  const dmMsg = [...dm.msgs].reverse().find(m => m.t === 'dm')
  placedId = Object.keys(dmMsg.session.placements).find(k => k.startsWith('plc.'))
}
console.log('\nruntime placement:')
console.log('  new placement id:', placedId)
console.log('  visible to table before reveal:',
  !!cur(latest(table)).tokens.find(t => t.id === placedId))

dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'table', targets: [`${placedId}#presence`, `${placedId}#identity`] } }))
await wait(120)
console.log('  visible after reveal:  ',
  !!cur(latest(table)).tokens.find(t => t.id === placedId))

dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'sendToScene', placement: placedId, scene: 'ranch' } }))
await wait(120)
console.log('  still on gnomengarde:  ',
  !!cur(latest(table)).tokens.find(t => t.id === placedId), '(moved to another map)')

dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'unplace', placement: placedId } }))
await wait(120)
{
  const dmMsg = [...dm.msgs].reverse().find(m => m.t === 'dm')
  const gone = !dmMsg.session.placements[placedId]
  const revealsGone = !JSON.stringify(dmMsg.session.reveals).includes(placedId)
  console.log('  removed:', gone, '| its reveals cleaned up:', revealsGone)
  if (!revealsGone) { console.log('  LEAK: stale reveals would be inherited by a reused id'); leaks++ }
}

// 4d. A note reaches its recipient; the table hears it only if shared.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'note', audience: 'emeric', text: 'You hear it before anyone else does.' } }))
await wait(120)
console.log('\nprivate note:')
console.log('  emeric receives:', JSON.stringify(latest(emeric).notes.map(n => n.text)))
console.log('  table receives: ', JSON.stringify(latest(table).notes))
if (JSON.stringify(latest(table)).includes('hear it before anyone')) {
  console.log('  LEAK: a private note reached the shared screen'); leaks++
} else console.log('  ok    the shared screen received none of it')

// The recipient, not the DM, decides whether it travels.
const noteId = latest(emeric).notes[0].id
table.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'shareNote', note: noteId } }))
await wait(120)
console.log('  a non-recipient sharing it:',
  latest(table).notes.length === 0 ? 'refused' : 'ALLOWED (bug)')
if (latest(table).notes.length !== 0) leaks++

emeric.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'shareNote', note: noteId } }))
await wait(120)
console.log('  the recipient sharing it: ',
  latest(table).notes.length === 1 ? 'reaches the table' : 'FAILED (bug)')
if (latest(table).notes.length !== 1) leaks++

// 4e. Items are granted by reveal, per audience.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'emeric', targets: ['item.ledger#presence', 'item.ledger#detail'] } }))
await wait(120)
console.log('\nitem given to one player:')
console.log('  emeric holds:', JSON.stringify(latest(emeric).items.map(i => i.name)))
console.log('  table holds: ', JSON.stringify(latest(table).items.map(i => i.name)))

// 4f. Moving the whole party IS the scene change: everyone's screen
// follows, the destination is revealed, and the party is visible in it.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'moveParty', scene: 'ranch' } }))
await wait(150)
{
  const dmMsg = [...dm.msgs].reverse().find(m => m.t === 'dm')
  const pcs = Object.entries(dmMsg.session.placements)
    .filter(([id]) => id.startsWith('region.pc.'))
  const tw = cur(latest(table))
  const ranch = tw // cur() returns the presented scene's view
  console.log('\nmove party:')
  console.log('  party members:', pcs.length,
    '| all at ranch:', pcs.every(([, p]) => p.scene === 'ranch'),
    '| stacked:', new Set(pcs.map(([, p]) => `${p.x},${p.y}`)).size === 1)
  console.log('  table now looking at:', latest(table).presented,
    '| party visible there:',
    pcs.every(([id]) => ranch.tokens.some(t => t.id === id)))
  if (latest(table).presented !== 'ranch') { console.log('  FAIL: view did not follow'); leaks++ }
  if (!pcs.every(([id]) => ranch.tokens.some(t => t.id === id))) {
    console.log('  FAIL: party not revealed at destination'); leaks++
  }
}

// 4g. Sending one person somewhere carries their screen, and only theirs.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'sendToScene', placement: 'region.pc.emeric', scene: 'excavation' } }))
await wait(150)
{
  const em = latest(emeric)
  const tb = latest(table)
  const there = em.scenes.find(s => s.id === 'excavation')
  console.log('\nsend one person:')
  console.log('  emeric now looking at:', em.presented,
    '| table still at:', tb.presented)
  console.log('  emeric sees himself there:',
    !!there?.tokens.some(t => t.id === 'region.pc.emeric'))
  if (em.presented !== 'excavation') { console.log('  FAIL: their view did not follow'); leaks++ }
  if (tb.presented !== 'ranch') { console.log('  FAIL: the table was dragged along'); leaks++ }
  // Put him back so nothing downstream depends on the split.
  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'sendToScene', placement: 'region.pc.emeric', scene: 'ranch' } }))
  await wait(120)
}

// 4h. Clocks: hidden ticks stay hidden; shown clocks update live.
dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'clockTicks', clock: 'clock.town', ticks: 2 } }))
await wait(120)
console.log('\nclocks:')
console.log('  hidden clock on table screen:', latest(table).clocks.length === 0 ? 'absent (correct)' : 'PRESENT (leak)')
if (latest(table).clocks.length !== 0) leaks++

dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'table', targets: ['clock.town#presence', 'clock.town#track'] } }))
await wait(120)
let tclock = latest(table).clocks.find(c => c.id === 'clock.town')
console.log('  after show:', tclock ? `ticks=${tclock.ticks}, text="${(tclock.latestText ?? '').slice(0, 30)}..."` : 'MISSING')
if (!tclock || tclock.ticks !== 2) { console.log('  FAIL: shown clock did not carry its ticks'); leaks++ }

dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'clockTicks', clock: 'clock.town', ticks: 3 } }))
await wait(120)
tclock = latest(table).clocks.find(c => c.id === 'clock.town')
console.log('  after a tick:', tclock?.ticks === 3 ? 'table updated live' : 'DID NOT UPDATE')
if (tclock?.ticks !== 3) leaks++

// 4i. The DM drags a pin onto the printed marker; everyone sees the
// corrected spot, and undo restores the campaign's guess.
{
  const before = latest(table).scenes.find(s => s.id === 'region')
    .pins.find(p => p.id === 'phandalin')
  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'movePin', scene: 'phandalin', x: 0.5, y: 0.5 } }))
  await wait(120)
  const moved = latest(table).scenes.find(s => s.id === 'region')
    .pins.find(p => p.id === 'phandalin')
  console.log('\nmove pin:')
  console.log('  table sees it at:', moved.x, moved.y,
    moved.x === 0.5 && moved.y === 0.5 ? '(corrected)' : '(FAIL)')
  if (moved.x !== 0.5) leaks++
  dm.ws.send(JSON.stringify({ t: 'undo' }))
  await wait(120)
  const back = latest(table).scenes.find(s => s.id === 'region')
    .pins.find(p => p.id === 'phandalin')
  console.log('  after undo:', back.x === before.x && back.y === before.y
    ? 'campaign position restored' : 'FAIL: undo did not restore')
  if (back.x !== before.x) leaks++
}

// 4j. A way out is not containment: a sub-level links back to its own
// parent, which a pin could never do without making a cycle.
{
  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'present', audience: 'table', scene: 'stonehill-up' } }))
  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'reveal', audience: 'table',
    targets: ['stonehill-up#presence', 'stonehill#presence'] } }))
  await wait(150)
  const up = latest(table).scenes.find(s => s.id === 'stonehill-up')
  console.log('\nways out:')
  console.log('  upstairs links to:', JSON.stringify(up.links.map(l => `${l.id} (${l.name})`)))
  if (!up.links.some(l => l.id === 'stonehill')) { console.log('  FAIL: no way back down'); leaks++ }

  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: {
    t: 'moveLink', from: 'stonehill-up', to: 'stonehill', x: 0.2, y: 0.3 } }))
  await wait(120)
  const moved = latest(table).scenes.find(s => s.id === 'stonehill-up').links[0]
  console.log('  after the DM drags it:', moved.x, moved.y,
    moved.x === 0.2 ? '(corrected)' : '(FAIL)')
  if (moved.x !== 0.2) leaks++
  dm.ws.send(JSON.stringify({ t: 'undo' }))
  await wait(120)
}

// 4k. Showing a place discovers it: an unrevealed scene presented to
// the table becomes visible to the table in the same command.
{
  const before = latest(table).scenes.some(s => s.id === 'conyberry')
  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'present', audience: 'table', scene: 'conyberry' } }))
  await wait(150)
  const after = latest(table)
  const sc = after.scenes.find(s => s.id === 'conyberry')
  console.log('\nshowing discovers:')
  console.log('  known before:', before, '| known after:', !!sc,
    '| on screen:', after.presented === 'conyberry')
  console.log('  description reached them:', !!sc?.description)
  if (!sc || after.presented !== 'conyberry' || !sc.description) {
    console.log('  FAIL: presented a place the audience cannot see'); leaks++
  }
}

// 4l. Marking a place on the map without going there: the pin appears
// on its parent map and nobody travels.
{
  const wasAt = latest(table).presented
  dm.ws.send(JSON.stringify({ t: 'cmd', cmd: {
    t: 'reveal', audience: 'table', targets: ['thundertree#presence'] } }))
  await wait(140)
  const w = latest(table)
  const region = w.scenes.find(s => s.id === 'region')
  console.log('\nmarked on the map:')
  console.log('  pin on the region map:',
    region.pins.some(p => p.id === 'thundertree'),
    '| still looking at:', w.presented, w.presented === wasAt ? '(nobody moved)' : '(FAIL)')
  if (!region.pins.some(p => p.id === 'thundertree') || w.presented !== wasAt) leaks++
}

// 5. A player client trying to issue a command.
emeric.ws.send(JSON.stringify({ t: 'cmd', cmd: { t: 'clockTicks', clock: 'clock.cryovain', ticks: 8 } }))
await wait(120)
const err = [...emeric.msgs].reverse().find(m => m.t === 'error')
console.log('player command rejected:', JSON.stringify(err?.message))

console.log(leaks === 0 ? '\nPASS: no DM-only content on the wire' : `\nFAIL: ${leaks} leak(s)`)
process.exit(leaks === 0 ? 0 : 1)
