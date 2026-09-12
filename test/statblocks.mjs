import WebSocket from 'ws'
const open = (role, extra={}) => new Promise(res => {
  const ws = new WebSocket('ws://localhost:8080/ws'); const msgs=[]
  ws.on('open',()=>ws.send(JSON.stringify({t:'join',room:'table',role,...extra})))
  ws.on('message',d=>{msgs.push(JSON.parse(String(d))); if(msgs.length===2) res({ws,msgs})})
})
const dm = await open('dm',{dmKey:'testkey'}); const table = await open('table')
const wait = ms => new Promise(r=>setTimeout(r,ms))
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'present',audience:'table',scene:'ranch'}}))
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'reveal',audience:'table',
  targets:['ranch.mon.yargath#presence','ranch.mon.yargath#identity','ranch.mon.yargath#lore']}}))
await wait(150)
const w = [...table.msgs].reverse().find(m=>m.t==='update').update.world
const blob = JSON.stringify(w)
const needles = [['stat block bar','93 (11d8'],['ability scores','18 (+4)'],
  ['action text','Gruumsh'],['running-it note','hold a gate'],['npc voice','Never raises it']]
let bad=0
for (const [l,n] of needles){ const hit=blob.includes(n); if(hit) bad++; console.log(`  ${hit?'LEAK':'ok  '}  ${l}`) }
const tok = w.scenes.find(s=>s.id===w.presented).tokens.find(t=>t.id==='ranch.mon.yargath')
console.log('  token on wire keys:', JSON.stringify(Object.keys(tok)))
console.log('  revealed lore entry:', JSON.stringify(tok.entries.map(e=>e.id)))
// An item's block reaches whoever holds it, and nobody else.
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'reveal',audience:'table',
  targets:['item.icehewer#presence','item.icehewer#detail']}}))
await wait(150)
{
  const w = [...table.msgs].reverse().find(m=>m.t==='update').update.world
  const it = w.items.find(i => i.id === 'item.icehewer')
  console.log('\nitem block:')
  console.log('  holder sees stats:', !!it?.stats, '| bar:', JSON.stringify(it?.stats?.bar?.[0]))
  console.log('  DM-only secret withheld:', !JSON.stringify(w).includes('Do not hand it to Levi'))
  if (!it?.stats) { console.log('  FAIL: the holder cannot read what it does'); bad++ }
  if (JSON.stringify(w).includes('Do not hand it to Levi')) {
    console.log('  LEAK: the DM note travelled with it'); bad++
  }
}

console.log(bad===0 ? '\nPASS: stat blocks never reach a player' : `\nFAIL: ${bad}`)
process.exit(bad===0?0:1)
