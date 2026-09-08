import type { Command } from './session.js'
import type { Update } from './project.js'
import type { CampaignIR } from './ir.js'
import type { SessionState } from './session.js'

/** Client -> server. */
export type ClientMsg =
  | { t: 'join'; room: string; role: 'dm' | 'table' | 'personal'; audience?: string; dmKey?: string }
  | { t: 'cmd'; cmd: Command }
  | { t: 'undo' }
  | { t: 'reset' }
  | { t: 'resync'; seq: number }

/** Server -> client. */
export type ServerMsg =
  | { t: 'joined'; role: 'dm' | 'table' | 'personal'; audience: string
      audiences: { id: string; name: string; personal: boolean }[]
      /** For the join screen, which happens before a world exists. */
      title: string; lobby: string | null }
  | { t: 'denied'; reason: string }
  | { t: 'update'; update: Update }
  | { t: 'dm'; seq: number; ir: SerialisedIR; session: SessionState; logLength: number }
  | { t: 'error'; message: string }

/** CampaignIR minus the Map, which does not survive JSON. */
export type SerialisedIR = Omit<CampaignIR, 'symbols'> & {
  symbols: [string, { kind: string; scene: string | null }][]
}

export const serialiseIR = (ir: CampaignIR): SerialisedIR =>
  ({ ...ir, symbols: [...ir.symbols.entries()] as SerialisedIR['symbols'] })

export const deserialiseIR = (s: SerialisedIR): CampaignIR =>
  ({ ...s, symbols: new Map(s.symbols) } as unknown as CampaignIR)
