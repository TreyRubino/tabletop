import {
  initialSession, fold, apply, project,
  type CampaignIR, type SessionState, type Command, type ServerMsg,
} from '@tabletop/core'

export type Role = 'dm' | 'player'

export interface Client {
  id: number
  role: Role
  send(msg: ServerMsg): void
}

/* ------------------------------------------------------------------
   The room owns authoritative state. Clients never hold it; they hold
   a projection. Undo is a pop and a refold, which is cheap because
   logs are short and the reducer is pure.

   The log lives in memory and nowhere else. There is no database: the
   only state in a session is which scene is up and which picture of
   it, and losing that on a restart costs one click. Persisting it
   bought nothing and cost a schema, a file on disk and a class.

   Driving the night is the DM's alone. A player's socket can send
   anything it likes and the room will not apply it.
------------------------------------------------------------------ */

export class Room {
  private log: Command[] = []
  private state: SessionState
  private clients = new Map<number, Client>()
  private nextClientId = 1
  private seq = 0

  constructor(readonly ir: CampaignIR) {
    this.state = initialSession(ir)
  }

  get session() { return this.state }
  get logLength() { return this.log.length }

  join(role: Role, send: (m: ServerMsg) => void): Client {
    const client: Client = { id: this.nextClientId++, role, send }
    this.clients.set(client.id, client)
    client.send({ t: 'joined', role, title: this.ir.title })
    this.pushTo(client)
    return client
  }

  leave(client: Client) {
    this.clients.delete(client.id)
  }

  dispatch(client: Client, cmd: Command): void {
    if (client.role !== 'dm') {
      client.send({ t: 'error', message: 'that is the DM\'s to change' })
      return
    }
    this.state = apply(this.ir, this.state, cmd)
    this.log.push(cmd)
    this.seq++
    this.broadcast()
  }

  undo(client: Client): void {
    if (client.role !== 'dm') return
    if (this.log.length === 0) return
    this.log.pop()
    this.state = fold(this.ir, this.log)
    this.seq++
    this.broadcast()
  }

  reset(client: Client): void {
    if (client.role !== 'dm') return
    this.log = []
    this.state = fold(this.ir, [])
    this.seq++
    this.broadcast()
  }

  resync(client: Client) { this.pushTo(client) }

  /* ---- projection dispatch: one per role, reused across the clients
     that share it. Both roles see the same content; the role decides
     who gets controls drawn, and the check above decides who is
     actually obeyed. ---- */

  private message(role: Role): ServerMsg {
    return {
      t: 'world',
      seq: this.seq,
      world: project(this.ir, this.state, role),
      logLength: this.log.length,
    }
  }

  private pushTo(client: Client) {
    client.send(this.message(client.role))
  }

  private broadcast() {
    const cache = new Map<Role, ServerMsg>()
    for (const client of this.clients.values()) {
      let msg = cache.get(client.role)
      if (!msg) { msg = this.message(client.role); cache.set(client.role, msg) }
      client.send(msg)
    }
  }
}
