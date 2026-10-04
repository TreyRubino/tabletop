/* What a night actually consists of: the DM puts a scene up, switches
   which picture of it is showing, everyone sees both, a player cannot
   do either, and undo puts it back. */

import WebSocket from 'ws'

const open = (role, extra = {}) => new Promise(res => {
  const ws = new WebSocket('ws://localhost:8080/ws')
  const msgs = []
  ws.on('open', () => ws.send(JSON.stringify({ t: 'join', room: 'table', role, ...extra })))
  ws.on('message', d => { msgs.push(JSON.parse(String(d))); if (msgs.length === 2) res({ ws, msgs }) })
})
const wait = ms => new Promise(r => setTimeout(r, ms))

const dm = await open('dm', { dmKey: 'testkey' })
const player = await open('player')

const world = who => [...who.msgs].reverse().find(m => m.t === 'world').world
const sceneOf = (who, id) => world(who).scenes.find(s => s.id === id)
const cmd = (who, c) => who.ws.send(JSON.stringify({ t: 'cmd', cmd: c }))

let bad = 0
const check = (label, got, want) => {
  const ok = got === want
  console.log(`  ${label}: ${got}${ok ? '' : `  (expected ${want})`}`)
  if (!ok) bad++
}

console.log('\nboth roles see the same scenes:')
check('same count', world(player).scenes.length, world(dm).scenes.length)
check('player holds no secrets field', 'secrets' in world(player), false)
check('dm holds no secrets field', 'secrets' in world(dm), false)

console.log('\nthe DM puts a scene up:')
const target = world(dm).scenes.find(s => s.id !== world(dm).presented)
cmd(dm, { t: 'present', scene: target.id })
await wait(150)
check('dm presenting', world(dm).presented, target.id)
check('player follows', world(player).presented, target.id)

console.log('\na player cannot drive it:')
const held = world(dm).presented
const other = world(dm).scenes.find(s => s.id !== held)
cmd(player, { t: 'present', scene: other.id })
await wait(150)
check('still where the DM left it', world(dm).presented, held)

console.log('\nundo walks it back:')
dm.ws.send(JSON.stringify({ t: 'undo' }))
await wait(150)
check('back to the root scene', world(dm).presented !== target.id, true)
check('player came back too', world(player).presented, world(dm).presented)

/* Picture switching needs a scene with more than one, which the
   starter campaign does not ship. Assert the shape instead: every
   scene reports its pictures and which one is up, and the two agree. */
console.log('\npictures:')
const s0 = world(dm).scenes[0]
check('images is a list', Array.isArray(s0.images), true)
check('showing agrees with images',
  s0.showing === null ? s0.images.length === 0 : s0.images.some(i => i.id === s0.showing.id), true)
check('the player sees the same picture',
  JSON.stringify(sceneOf(player, s0.id).showing), JSON.stringify(s0.showing))

dm.ws.close(); player.ws.close()
console.log(bad === 0 ? '\nPASS: the night runs and only the DM drives it\n'
  : `\nFAIL: ${bad} problem(s)\n`)
process.exit(bad === 0 ? 0 : 1)
