import {
  fold, commit, project, encodeUpdate, serialiseIR,
  tableViewer, personalViewer, playerMayIssue, TABLE,
  type CampaignIR, type SessionState, type Command, type Observer,
  type AudienceId, type ServerMsg,
} from '@tabletop/core'
import type { Store } from './store.js'

export type Role = 'dm' | 'table' | 'personal'

export interface Client {
  id: number
  role: Role
  audience: AudienceId
  send(msg: ServerMsg): void
}

/* ------------------------------------------------------------------
   The room owns authoritative state. Clients never hold it; they hold
   a projection computed for their audience. Undo is a pop and refold,
   which is cheap because logs are short and the reducer is pure.
------------------------------------------------------------------ */

export class Room {
  private log: Command[] = []
  private state: SessionState
  private clients = new Map<number, Client>()
  private nextClientId = 1
  private seq = 0

  /** The behaviour seam. Empty today; triggers subscribe here. */
  private observers: Observer[] = []

  constructor(readonly ir: CampaignIR, private store: Store) {
    // The session is a fold over whatever the database already holds, so
    // restarting the server mid-session costs nothing.
    this.log = store.log(ir.id).map(e => e.command)
    this.state = fold(ir, this.log)
    this.seq = this.log.length
  }

  get session() { return this.state }
  get logLength() { return this.log.length }

  join(role: Role, audience: AudienceId, send: (m: ServerMsg) => void): Client {
    const client: Client = { id: this.nextClientId++, role, audience, send }
    this.clients.set(client.id, client)
    client.send({
      t: 'joined',
      role,
      audience,
      audiences: this.ir.audiences.map(a => ({ id: a.id, name: a.name, personal: a.personal })),
      title: this.ir.title,
      lobby: this.ir.lobby,
    })
    this.pushTo(client)
    return client
  }

  leave(client: Client) {
    this.clients.delete(client.id)
  }

  dispatch(client: Client, cmd: Command): void {
    /* Players hold one narrow slice of authority: what to do with a note
       addressed to them. The check runs here, against server state. */
    if (client.role !== 'dm' && !playerMayIssue(this.ir, this.state, client.audience, cmd)) {
      client.send({ t: 'error', message: 'that is the DM\'s to change' })
      return
    }
    const who = client.role === 'dm' ? 'dm' : client.audience
    const { state, applied } = commit(this.ir, this.state, cmd, this.observers)
    this.state = state
    for (const c of applied) this.store.append(this.ir.id, c, who)
    this.log.push(...applied)
    this.seq++
    this.broadcast()
  }

  undo(client: Client): void {
    if (client.role !== 'dm') return
    if (!this.store.dropLast(this.ir.id)) return
    this.log = this.store.log(this.ir.id).map(e => e.command)
    this.state = fold(this.ir, this.log)
    this.seq++
    this.broadcast()
  }

  reset(client: Client): void {
    if (client.role !== 'dm') return
    this.store.clearLog(this.ir.id)
    this.log = []
    this.state = fold(this.ir, [])
    this.seq++
    this.broadcast()
  }

  /* ---- projection dispatch: one projection per audience, reused across
     clients that share it. The DM gets authoritative state instead. ---- */

  private pushTo(client: Client) {
    if (client.role === 'dm') {
      client.send({
        t: 'dm',
        seq: this.seq,
        ir: serialiseIR(this.ir),
        session: this.state,
        logLength: this.log.length,
      })
      return
    }
    const viewer = client.role === 'personal'
      ? personalViewer(client.audience)
      : tableViewer()
    const world = project(this.ir, this.state, viewer)
    client.send({ t: 'update', update: encodeUpdate(this.seq, world) })
  }

  private broadcast() {
    const cache = new Map<string, ServerMsg>()
    for (const client of this.clients.values()) {
      if (client.role === 'dm') { this.pushTo(client); continue }
      const key = `${client.role}:${client.audience}`
      let msg = cache.get(key)
      if (!msg) {
        const viewer = client.role === 'personal'
          ? personalViewer(client.audience)
          : tableViewer()
        msg = { t: 'update', update: encodeUpdate(this.seq, project(this.ir, this.state, viewer)) }
        cache.set(key, msg)
      }
      client.send(msg)
    }
  }

  resync(client: Client) { this.pushTo(client) }

  knownAudience(id: string): id is AudienceId {
    return id === TABLE || this.ir.audiences.some(a => a.id === id)
  }
}
