import WebSocket from 'ws'
const open = (role, extra={}) => new Promise(res => {
  const ws = new WebSocket('ws://localhost:8080/ws'); const msgs=[]
  ws.on('open',()=>ws.send(JSON.stringify({t:'join',room:'table',role,...extra})))
  ws.on('message',d=>{msgs.push(JSON.parse(String(d))); if(msgs.length===2) res({ws,msgs})})
})
const wait = ms => new Promise(r=>setTimeout(r,ms))
const dm = await open('dm',{dmKey:'testkey'})
const table = await open('table')
const latest = c => [...c.msgs].reverse().find(m=>m.t==='update').update.world
let bad = 0

// The half-revealed case their live database can contain: presence
// without track. The name shows; the track must read as hidden, and
// ticking must not pretend otherwise.
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'reveal',audience:'table',targets:['clock.town#presence']}}))
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'clockTicks',clock:'clock.town',ticks:2}}))
await wait(150)
{
  const k = latest(table).clocks.find(c=>c.id==='clock.town')
  console.log('half-revealed: name on wire:', !!k, '| ticks:', k?.ticks, '| text:', k?.latestText)
  if (!k) { console.log('  FAIL: presence reveal did not surface the clock'); bad++ }
  if (k && k.ticks !== null) { console.log('  FAIL: track leaked without its reveal'); bad++ }
}

// The paired reveal: now the track exists on player screens and every
// tick lands there.
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'reveal',audience:'table',targets:['clock.town#track']}}))
await wait(120)
{
  const k = latest(table).clocks.find(c=>c.id==='clock.town')
  console.log('track revealed: ticks:', k.ticks, '| latest:', JSON.stringify(k.latestText))
  if (k.ticks !== 2) { console.log('  FAIL: existing ticks did not surface'); bad++ }
}
dm.ws.send(JSON.stringify({t:'cmd',cmd:{t:'clockTicks',clock:'clock.town',ticks:3}}))
await wait(120)
{
  const k = latest(table).clocks.find(c=>c.id==='clock.town')
  console.log('after tick: ticks:', k.ticks, '| latest mentions families:',
    (k.latestText ?? '').includes('families'))
  if (k.ticks !== 3) { console.log('  FAIL: the tick never reached the table'); bad++ }
  if (!(k.latestText ?? '').includes('families')) { console.log('  FAIL: event text missing'); bad++ }
}

console.log(bad===0 ? '\nPASS: clocks reach every screen' : `\nFAIL: ${bad}`)
process.exit(bad===0?0:1)
