import type { Command } from './session.js'
import type { World } from './project.js'

/** Client -> server. */
export type ClientMsg =
  | { t: 'join'; room: string; role: 'dm' | 'player'; dmKey?: string }
  | { t: 'cmd'; cmd: Command }
  | { t: 'undo' }
  | { t: 'reset' }
  | { t: 'resync' }

/** Server -> client. */
export type ServerMsg =
  | { t: 'joined'; role: 'dm' | 'player'; title: string }
  | { t: 'denied'; reason: string }
  /** The whole world, every time. It is small enough that a diff would
      cost more to maintain than it saves on the wire. */
  | { t: 'world'; seq: number; world: World; logLength: number }
  | { t: 'error'; message: string }
