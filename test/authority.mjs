import WebSocket from 'ws'
const open = (role, extra={}) => new Promise(res => {
  const ws = new WebSocket('ws://localhost:8080/ws'); const msgs=[]
  ws.on('open',()=>ws.send(JSON.stringify({t:'join',room:'table',role,...extra})))
  ws.on('message',d=>{msgs.push(JSON.parse(String(d))); if(msgs.length===2) res({ws,msgs})})
})
const wait = ms => new Promise(r=>setTimeout(r,ms))
const dm = await open('dm',{dmKey:'testkey'})
const emeric = await open('personal',{audience:'emeric'})
const sess = () => [...dm.msgs].reverse().find(m=>m.t==='dm').session
let bad = 0
const at = id => { const p = sess().placements[id]; return `${p.scene} ${p.x.toFixed(2)},${p.y.toFixed(2)}` }

dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'moveParty',scene:'gnomengarde'}}))
await wait(150)

// 1. His own token, on the map he is standing on: allowed.
const before = at('region.pc.emeric')
emeric.ws.send(JSON.stringify({t:'cmd',cmd:{t:'moveToken',placement:'region.pc.emeric',x:0.71,y:0.33}}))
await wait(140)
console.log('own token, same map:', before, '->', at('region.pc.emeric'),
  at('region.pc.emeric').includes('0.71') ? 'MOVED (correct)' : 'BLOCKED (bug)')
if (!at('region.pc.emeric').includes('0.71')) bad++

// 2. Somebody else's token: refused.
const levi = at('region.pc.paladin')
emeric.ws.send(JSON.stringify({t:'cmd',cmd:{t:'moveToken',placement:'region.pc.paladin',x:0.11,y:0.11}}))
await wait(140)
console.log("another player's token:", at('region.pc.paladin') === levi ? 'refused (correct)' : 'MOVED (bug)')
if (at('region.pc.paladin') !== levi) bad++

// 3. A token that is not on the map he is looking at: refused.
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'sendToScene',placement:'region.pc.wizard',scene:'camp'}}))
await wait(140)
const amryn = at('region.pc.wizard')
emeric.ws.send(JSON.stringify({t:'cmd',cmd:{t:'moveToken',placement:'region.pc.wizard',x:0.9,y:0.9}}))
await wait(140)
console.log('a token on another map: ', at('region.pc.wizard') === amryn ? 'refused (correct)' : 'MOVED (bug)')
if (at('region.pc.wizard') !== amryn) bad++

// 4. Scene changes stay the DM's.
emeric.ws.send(JSON.stringify({t:'cmd',cmd:{t:'present',audience:'emeric',scene:'hold'}}))
await wait(140)
const w = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world
console.log('player presenting a scene:', w.presented === 'hold' ? 'ALLOWED (bug)' : 'refused (correct)')
if (w.presented === 'hold') bad++

// 5. Portraits and real names reached the wire.
const me = w.scenes.find(s=>s.id===w.presented)?.tokens.find(t=>t.mine)
console.log('his own token:', JSON.stringify({name: me?.name, art: me?.art, mine: me?.mine}))
if (!me?.art || me.name !== 'Emeric') { console.log('  FAIL: name/portrait missing'); bad++ }

// 6. A party move lands on every screen at once, including a player who
// had been split off somewhere else entirely.
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'sendToScene',placement:'region.pc.emeric',scene:'camp'}}))
await wait(150)
const split = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world.presented
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'moveParty',scene:'axeholm'}}))
await wait(170)
{
  const em = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world
  console.log('\nparty move reaches a split player:')
  console.log('  was split off at:', split, '-> now at:', em.presented)
  if (em.presented !== 'axeholm') { console.log('  FAIL: stranded on the old scene'); bad++ }
  const here = em.scenes.find(s => s.id === 'axeholm')
  const mine = here?.tokens.find(t => t.mine)
  console.log('  sees himself standing there:', !!mine)
  if (!mine) { console.log('  FAIL: party not visible at the destination'); bad++ }
}

// 7. Showing one player a place, without moving anybody's token.
{
  const before = sess().placements['region.pc.wizard'].scene
  dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'present',audience:'emeric',scene:'shrine'}}))
  await wait(160)
  const em = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world
  const tb = [...dm.msgs].reverse().find(m=>m.t==='dm').session.presented
  console.log('\nshow one player a place:')
  console.log('  emeric looking at:', em.presented,
    '| the table:', tb.table?.scene)
  console.log('  he can read it:', !!em.scenes.find(s => s.id === 'shrine')?.description)
  console.log('  nobody moved:', sess().placements['region.pc.wizard'].scene === before
    && sess().placements['region.pc.emeric'].scene !== 'shrine')
  if (em.presented !== 'shrine') { console.log('  FAIL: view did not reach him'); bad++ }
  if (tb.table?.scene === 'shrine') { console.log('  FAIL: the table was dragged along'); bad++ }
  if (!em.scenes.find(s => s.id === 'shrine')?.description) {
    console.log('  FAIL: shown a place he cannot read'); bad++
  }
  if (sess().placements['region.pc.emeric'].scene === 'shrine') {
    console.log('  FAIL: his token travelled'); bad++
  }
}

// 8. Following and splitting are one setting, not two that can disagree.
{
  // Clear whatever the earlier cases left him split on.
  dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'follow',audience:'emeric'}}))
  dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'present',audience:'table',scene:'phandalin'}}))
  await wait(160)
  const following = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world.presented
  dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'present',audience:'emeric',scene:'stonehill'}}))
  await wait(140)
  const apart = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world.presented
  dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'follow',audience:'emeric'}}))
  await wait(140)
  const back = [...emeric.msgs].reverse().find(m=>m.t==='update').update.world.presented
  console.log('\nfollow / split / follow:')
  console.log(' ', following, '->', apart, '->', back)
  if (following !== 'phandalin' || apart !== 'stonehill' || back !== 'phandalin') {
    console.log('  FAIL: the audience state does not round-trip'); bad++
  }
  const own = sess().presented.emeric
  console.log('  no leftover override:', own === undefined)
  if (own !== undefined) { console.log('  FAIL: still split after rejoining'); bad++ }
}

// 9. A monster can be moved between maps without touching any screen.
{
  const table0 = sess().presented.table?.scene
  dm.ws.send(JSON.stringify({t:'cmd',cmd:{
    t:'sendToScene', placement:'gnomengarde.mon.mimic', scene:'axeholm'}}))
  await wait(140)
  const p = sess().placements['gnomengarde.mon.mimic']
  const table1 = sess().presented.table?.scene
  console.log('\nmoving a monster:')
  console.log('  mimic now at:', p.scene, '| table still at:', table1)
  if (p.scene !== 'axeholm') { console.log('  FAIL: it did not move'); bad++ }
  if (table1 !== table0) { console.log('  FAIL: a monster dragged a screen with it'); bad++ }
}

console.log(bad===0 ? '\nPASS: players move themselves and nothing else' : `\nFAIL: ${bad}`)
process.exit(bad===0?0:1)
