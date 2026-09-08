import { useEffect, useRef, useState, useCallback } from 'react'
import {
  deserialiseIR,
  type ClientMsg, type ServerMsg, type Command,
  type CampaignIR, type SessionState, type World,
} from '@tabletop/core'

export type Role = 'dm' | 'table' | 'personal'

export interface Connection {
  status: 'connecting' | 'open' | 'denied' | 'closed'
  reason: string | null
  /** DM only: authoritative state. */
  dm: { ir: CampaignIR; session: SessionState; logLength: number } | null
  /** Table and personal: the projection, and nothing else. */
  world: World | null
  audiences: { id: string; name: string; personal: boolean }[]
  /** Campaign title and lobby art, known before joining anything. */
  campaign: { title: string; lobby: string | null } | null
  send(cmd: Command): void
  undo(): void
}

export function useConnection(
  join: Extract<ClientMsg, { t: 'join' }> | null,
): Connection {
  const [status, setStatus] = useState<Connection['status']>('connecting')
  const [reason, setReason] = useState<string | null>(null)
  const [dm, setDm] = useState<Connection['dm']>(null)
  const [world, setWorld] = useState<World | null>(null)
  const [audiences, setAudiences] = useState<Connection['audiences']>([])
  const [campaign, setCampaign] = useState<Connection['campaign']>(null)
  const ws = useRef<WebSocket | null>(null)
  const seq = useRef(0)

  useEffect(() => {
    if (!join) return
    let closed = false
    let retry: number | undefined

    const connect = () => {
      if (closed) return
      const proto = location.protocol === 'https:' ? 'wss' : 'ws'
      const socket = new WebSocket(`${proto}://${location.host}/ws`)
      ws.current = socket

      socket.onopen = () => {
        setStatus('open')
        setReason(null)
        socket.send(JSON.stringify(join))
        // A laptop that slept and woke asks for whatever it missed.
        if (seq.current > 0) {
          socket.send(JSON.stringify({ t: 'resync', seq: seq.current } satisfies ClientMsg))
        }
      }

      socket.onmessage = e => {
        const msg = JSON.parse(String(e.data)) as ServerMsg
        switch (msg.t) {
          case 'joined':
            setAudiences(msg.audiences)
            setCampaign({ title: msg.title, lobby: msg.lobby })
            break
          case 'denied':
            setStatus('denied')
            setReason(msg.reason)
            closed = true
            break
          case 'dm':
            seq.current = msg.seq
            setDm({
              ir: deserialiseIR(msg.ir),
              session: msg.session,
              logLength: msg.logLength,
            })
            break
          case 'update':
            seq.current = msg.update.seq
            setWorld(msg.update.world)
            break
          case 'error':
            setReason(msg.message)
            break
        }
      }

      socket.onclose = () => {
        if (closed) return
        setStatus('closed')
        retry = window.setTimeout(connect, 1200)
      }
    }

    connect()
    return () => {
      closed = true
      window.clearTimeout(retry)
      ws.current?.close()
    }
  }, [JSON.stringify(join)])

  const send = useCallback((cmd: Command) => {
    ws.current?.readyState === WebSocket.OPEN
      && ws.current.send(JSON.stringify({ t: 'cmd', cmd } satisfies ClientMsg))
  }, [])

  const undo = useCallback(() => {
    ws.current?.readyState === WebSocket.OPEN
      && ws.current.send(JSON.stringify({ t: 'undo' } satisfies ClientMsg))
  }, [])

  return { status, reason, dm, world, audiences, campaign, send, undo }
}

/** Hash routing: #dm?room=x&key=y, #table?room=x, #join?room=x */
export function useRoute() {
  const parse = () => {
    const h = location.hash.replace(/^#/, '')
    const [path, qs] = h.split('?')
    return { path: path || 'join', params: new URLSearchParams(qs ?? '') }
  }
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}
