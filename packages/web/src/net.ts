import { useEffect, useRef, useState, useCallback } from 'react'
import type { ClientMsg, ServerMsg, Command, World } from '@tabletop/core'

export type Role = 'dm' | 'player'

export interface Connection {
  status: 'connecting' | 'open' | 'denied' | 'closed'
  reason: string | null
  world: World | null
  /** How many commands are behind us, so the DM's undo can say so. */
  logLength: number
  send(cmd: Command): void
  undo(): void
}

export function useConnection(join: Extract<ClientMsg, { t: 'join' }>): Connection {
  const [status, setStatus] = useState<Connection['status']>('connecting')
  const [reason, setReason] = useState<string | null>(null)
  const [world, setWorld] = useState<World | null>(null)
  const [logLength, setLogLength] = useState(0)
  const ws = useRef<WebSocket | null>(null)
  const seq = useRef(0)

  useEffect(() => {
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
        if (seq.current > 0) socket.send(JSON.stringify({ t: 'resync' } satisfies ClientMsg))
      }

      socket.onmessage = e => {
        const msg = JSON.parse(String(e.data)) as ServerMsg
        switch (msg.t) {
          case 'joined':
            break
          case 'denied':
            setStatus('denied')
            setReason(msg.reason)
            closed = true
            break
          case 'world':
            seq.current = msg.seq
            setWorld(msg.world)
            setLogLength(msg.logLength)
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

  return { status, reason, world, logLength, send, undo }
}

/** Hash routing: #dm?room=x&key=y for the DM, anything else is a player. */
export function useRoute() {
  const parse = () => {
    const h = location.hash.replace(/^#/, '')
    const [path, qs] = h.split('?')
    return { path: path || 'play', params: new URLSearchParams(qs ?? '') }
  }
  const [route, setRoute] = useState(parse)
  useEffect(() => {
    const on = () => setRoute(parse())
    addEventListener('hashchange', on)
    return () => removeEventListener('hashchange', on)
  }, [])
  return route
}
