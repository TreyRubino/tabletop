import { createServer } from 'node:http'
import { networkInterfaces } from 'node:os'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomBytes } from 'node:crypto'
import { WebSocketServer, type WebSocket } from 'ws'
import type { ClientMsg, ServerMsg, AudienceId } from '@tabletop/core'
import { TABLE } from '@tabletop/core'
import { readCampaignSource, validateSource, resolveAsset, reportDiagnostics } from './load.js'
import { Room, type Client } from './room.js'
import { Store } from './store.js'

/* npm workspaces run scripts with cwd set to the package directory, so
   process.cwd() is not the repo root and cannot be used to find campaigns
   or the built client. Anchor to this module instead: dist/index.js sits
   at <root>/packages/server/dist, three levels down. A CAMPAIGN given as
   a relative path is resolved from the root; an absolute one passes
   through resolve() unchanged. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

const PORT = Number(process.env.PORT ?? 8080)
const CAMPAIGN = resolve(ROOT, process.env.CAMPAIGN ?? 'campaigns/icespire')
const ROOM_CODE = (process.env.ROOM ?? 'table').toLowerCase()
const DM_KEY = process.env.DM_KEY ?? randomBytes(4).toString('hex')

const DB = resolve(ROOT, process.env.DB ?? 'data/tabletop.db')

const src = readCampaignSource(CAMPAIGN)
if (!src.ok) {
  console.error(`\n${src.source}\n`)
  console.error(reportDiagnostics(src.diagnostics))
  process.exit(1)
}

// Validate before importing: a broken file must never reach the database.
const checked = validateSource(CAMPAIGN, src.json)
if (!checked.ok) {
  console.error(`\n${checked.source}\n`)
  console.error(reportDiagnostics(checked.diagnostics))
  console.error(`\n${checked.diagnostics.length} problem(s). Nothing started.\n`)
  process.exit(1)
}

const { ir, assetRoot, warnings } = checked.campaign
if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s):`)
  console.warn(reportDiagnostics(warnings))
}

const store = new Store(DB)
const sync = store.syncCampaign(ir.id, src.json)
const room = new Room(ir, store)

/* ---------------------------- http ---------------------------- */

const MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json',
}

const webDist = resolve(ROOT, 'packages/web/dist')

const http = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)

  if (url.pathname.startsWith('/assets/')) {
    const abs = resolveAsset(assetRoot, url.pathname.slice('/assets/'.length))
    if (!abs) { res.writeHead(404).end('not found'); return }
    res.writeHead(200, {
      'content-type': MIME[extname(abs).toLowerCase()] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=3600',
    })
    createReadStream(abs).pipe(res)
    return
  }

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ ok: true, campaign: ir.id, scenes: ir.scenes.length }))
    return
  }

  // In production the built client is served from here. In dev, Vite does it.
  if (existsSync(webDist)) {
    const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1)
    const abs = join(webDist, rel)
    if (abs.startsWith(webDist) && existsSync(abs) && statSync(abs).isFile()) {
      res.writeHead(200, { 'content-type': MIME[extname(abs).toLowerCase()] ?? 'text/plain' })
      createReadStream(abs).pipe(res)
      return
    }
    const index = join(webDist, 'index.html')
    if (existsSync(index)) {
      res.writeHead(200, { 'content-type': MIME['.html'] })
      createReadStream(index).pipe(res)
      return
    }
  }

  res.writeHead(404).end('not found')
})

/* ---------------------------- websocket ---------------------------- */

const wss = new WebSocketServer({ server: http, path: '/ws' })

wss.on('connection', (ws: WebSocket) => {
  let client: Client | null = null
  const send = (m: ServerMsg) => {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m))
  }

  ws.on('message', data => {
    let msg: ClientMsg
    try {
      msg = JSON.parse(String(data)) as ClientMsg
    } catch {
      send({ t: 'error', message: 'malformed message' })
      return
    }

    if (msg.t === 'join') {
      if (client) return
      if (msg.room.toLowerCase() !== ROOM_CODE) {
        send({ t: 'denied', reason: 'wrong room code' })
        ws.close()
        return
      }
      if (msg.role === 'dm' && msg.dmKey !== DM_KEY) {
        send({ t: 'denied', reason: 'wrong DM key' })
        ws.close()
        return
      }
      let audience: AudienceId = TABLE
      if (msg.role === 'personal') {
        if (!msg.audience || !room.knownAudience(msg.audience)) {
          send({ t: 'denied', reason: 'unknown player' })
          ws.close()
          return
        }
        audience = msg.audience as AudienceId
      }
      client = room.join(msg.role, audience, send)
      return
    }

    if (!client) { send({ t: 'error', message: 'join first' }); return }

    switch (msg.t) {
      case 'cmd': room.dispatch(client, msg.cmd); break
      case 'undo': room.undo(client); break
      case 'reset': room.reset(client); break
      case 'resync': room.resync(client); break
    }
  })

  ws.on('close', () => { if (client) room.leave(client) })
})

/* ---------------------------- start ---------------------------- */

http.listen(PORT, () => {
  const nets = Object.values(networkInterfaces())
    .flat()
    .filter((n): n is NonNullable<typeof n> => !!n && n.family === 'IPv4' && !n.internal)
  const lan = nets[0]?.address ?? 'localhost'

  console.log(`\n  ${ir.title}`)
  console.log(`  ${ir.scenes.length} scenes · ${ir.actors.length} actors · ${ir.items.length} items `
    + `· ${ir.quests.length} quests · ${ir.clocks.length} clocks`)
  console.log(`  db ${DB} · revision ${sync.revision}`
    + `${sync.reimported ? ' (re-imported, session kept)' : ''}`
    + ` · ${room.logLength} commands replayed\n`)
  console.log(`  DM        http://localhost:5173/#dm?room=${ROOM_CODE}&key=${DM_KEY}`)
  console.log(`  Table     http://localhost:5173/#table?room=${ROOM_CODE}`)
  console.log(`  Players   http://${lan}:5173/#join?room=${ROOM_CODE}\n`)
  console.log(`  room code   ${ROOM_CODE}`)
  console.log(`  DM key      ${DM_KEY}\n`)
})
