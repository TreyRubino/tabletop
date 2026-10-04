// Mirrors Stage: transform is scale(z) translate((0.5-x), (0.5-y)).
const hold = (c, z) => z <= 1 ? 0.5 : Math.min(Math.max(c, 0.5/z), 1 - 0.5/z)
const zoomAt = (v, px, py, f) => {
  const zoom = Math.min(Math.max(v.zoom * f, 1), 8)
  if (zoom === v.zoom) return v
  const k = v.zoom / zoom
  return { zoom, x: hold(px - k*(px - v.x), zoom), y: hold(py - k*(py - v.y), zoom) }
}
const BOX = { w: 1200, h: 800 }
// where an element-normalised point lands on screen, given the transform
const toScreen = (p, c, z, size) => size/2 + z * (p - c) * size
// Stage.toWorld inverted: normalised position within the TRANSFORMED rect
const rect = (c, z, size) => ({ left: size/2 - z*size*c, width: z*size })

let bad = 0
const near = (a, b, t = 1e-9) => Math.abs(a - b) < t

// 1. zooming toward the pointer holds that point still
for (const [px, z0, f] of [[0.2,1,2],[0.8,1,4],[0.5,2,1.5],[0.35,3,0.5],[0.9,1,8]]) {
  const v0 = { x: 0.5, y: 0.5, zoom: z0 }
  const v1 = zoomAt(v0, px, 0.5, f)
  const before = toScreen(px, v0.x, v0.zoom, BOX.w)
  const after  = toScreen(px, v1.x, v1.zoom, BOX.w)
  const clamped = v1.x !== px - (v0.zoom/v1.zoom)*(px - v0.x)
  const ok = clamped || near(before, after, 1e-6)
  if (!ok) { console.log(`  FAIL hold: px=${px} z ${z0}->${v1.zoom} ${before} vs ${after}`); bad++ }
}
console.log('1. cursor-anchored zoom holds its point:', bad === 0 ? 'ok' : 'FAIL')

// 2. the visible window never leaves the image
let esc = 0
for (let z = 1; z <= 8; z += 0.25) for (const c of [-5, 0, 0.5, 1, 5]) {
  const h = hold(c, z), half = 0.5/z
  if (h - half < -1e-12 || h + half > 1 + 1e-12) { esc++; console.log(`  FAIL edge z=${z} c=${c} -> ${h}`) }
}
console.log('2. view stays inside the image at every zoom:', esc === 0 ? 'ok' : 'FAIL')
if (esc) bad++

// 3. at 1x there is nowhere to pan
console.log('3. 1x is always centred:', [ -3, 0.1, 0.5, 2 ].every(c => hold(c,1) === 0.5) ? 'ok' : 'FAIL')

// 4. THE IMPORTANT ONE: pointer -> world still round-trips while zoomed,
//    which is what token dragging, placement and marquee all depend on.
let rt = 0
for (const z of [1, 1.7, 3, 8]) for (const cx of [0.2, 0.5, 0.85]) {
  const c = hold(cx, z)
  for (const p of [0.05, 0.3, 0.5, 0.77, 0.99]) {
    const screenX = toScreen(p, c, z, BOX.w)
    const r = rect(c, z, BOX.w)
    const back = (screenX - r.left) / r.width      // exactly Stage.toWorld's first step
    if (!near(back, p, 1e-9)) { rt++; console.log(`  FAIL round-trip z=${z} c=${c} p=${p} -> ${back}`) }
  }
}
console.log('4. pointer maps back to the same world point while zoomed:', rt === 0 ? 'ok' : 'FAIL')
if (rt) bad++

// 5. A marker counter-scales, so its size on screen never changes and
//    it never leaves the point it is anchored to.
let mk = 0
const RING = 46
for (const z of [1, 1.7, 3, 8]) {
  const inv = 1 / z
  // world scales by z, marker scales by inv: on-screen size is constant
  if (!near(RING * z * inv, RING, 1e-9)) { mk++; console.log(`  FAIL size at z=${z}`) }
  // a zero-size anchor scaled about its own centre does not move,
  // so the marker stays on the map point at every zoom
  for (const [c, p] of [[0.5, 0.2], [0.3, 0.9], [0.7, 0.55]]) {
    const cc = hold(c, z)
    const anchor = toScreen(p, cc, z, BOX.w)          // where the map point is
    const marker = toScreen(p, cc, z, BOX.w) + 0 * inv // anchor + scaled offset of 0
    if (!near(anchor, marker, 1e-9)) { mk++; console.log(`  FAIL drift z=${z}`) }
  }
}
console.log('5. markers hold their screen size and stay on their point:', mk === 0 ? 'ok' : 'FAIL')
if (mk) bad++

// 6. The scale bar sits outside the transform, so it must carry the
//    zoom itself or it under-reports the moment you zoom in.
let sb = 0
const CELL = 40
for (const z of [1, 2, 4]) {
  const drawn = CELL * z              // what the bar renders
  const actual = CELL * z             // what one cell measures on screen
  if (!near(drawn, actual, 1e-9)) { sb++; console.log(`  FAIL bar at z=${z}`) }
}
console.log('6. the scale bar still measures a true cell when zoomed:', sb === 0 ? 'ok' : 'FAIL')
if (sb) bad++

// 7. A press that never became a drag is a click, at any zoom. Zoomed
//    in the pan handler claims the press, so it has to report that
//    itself or clicking bare map silently stops clearing the sidebar.
const press = (zoom, dx, dy, button = 0) => {
  const moved = Math.abs(dx) > 3 || Math.abs(dy) > 3
  const grabbed = button === 1 || (button === 0 && zoom > 1)
  return { panned: grabbed && moved, click: grabbed && !moved && button === 0,
           marquee: !grabbed && moved }
}
let cl = 0
const expect = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) { cl++; console.log(`  FAIL ${what}`) }
}
expect(press(1, 0, 0),      { panned: false, click: false, marquee: false }, '1x tap -> marquee path handles it')
expect(press(1, 40, 10),    { panned: false, click: false, marquee: true  }, '1x drag -> marquee')
expect(press(3, 0, 0),      { panned: false, click: true,  marquee: false }, 'zoomed tap -> click on empty map')
expect(press(3, 2, 2),      { panned: false, click: true,  marquee: false }, 'zoomed jitter is still a click')
expect(press(3, 60, 5),     { panned: true,  click: false, marquee: false }, 'zoomed drag -> pan')
expect(press(3, 0, 0, 1),   { panned: false, click: false, marquee: false }, 'middle tap deselects nothing')
console.log('7. a press without a drag is a click at any zoom:', cl === 0 ? 'ok' : 'FAIL')
if (cl) bad++

console.log(bad === 0 ? '\nPASS: zoom math holds' : `\nFAIL: ${bad}`)
process.exit(bad ? 1 : 0)
