import { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { project, dmViewer, type ClientMsg } from '@tabletop/core'
import { useConnection, useRoute } from './net'
import { Table } from './Table'
import { useEffect, useRef } from 'react'
import { useToasts } from './ui/Toasts'
import './styles.css'

function App() {
  const { path, params } = useRoute()
  const room = params.get('room') ?? 'table'

  if (path === 'dm') return <Connected join={{ t: 'join', room, role: 'dm', dmKey: params.get('key') ?? '' }} />
  if (path === 'play') return <Connected join={{ t: 'join', room, role: 'personal', audience: params.get('as') ?? '' }} />
  if (path === 'table') return <Connected join={{ t: 'join', room, role: 'table' }} />
  return <Join room={room} />
}

function Connected({ join }: { join: Extract<ClientMsg, { t: 'join' }> }) {
  const conn = useConnection(join)
  const { toasts, push } = useToasts()
  useArrivals(join.role === 'dm' ? undefined : conn.world?.items, push)
  useTicks(join.role === 'dm' ? undefined : conn.world?.clocks, push)

  /* The DM's world is projected client-side from the IR they already
     hold. Players' worlds are projected server-side, before the wire.
     Same function, same output shape, different execution site. */
  const dmWorld = useMemo(
    () => (conn.dm ? project(conn.dm.ir, conn.dm.session, dmViewer()) : null),
    [conn.dm],
  )

  if (conn.status === 'denied') return <Notice title="Not letting you in" body={conn.reason ?? 'denied'} />
  if (conn.status !== 'open') return <Notice title="Connecting" body="Waiting for the table server." quiet />

  if (join.role === 'dm') {
    if (!conn.dm || !dmWorld) return <Notice title="Connecting" body="Loading the campaign." quiet />
    return (
      <Table
        world={dmWorld}
        send={conn.send}
        toasts={toasts}
        dm={{
          ir: conn.dm.ir,
          session: conn.dm.session,
          send: conn.send,
          undo: conn.undo,
          logLength: conn.dm.logLength,
          toast: push,
        }}
      />
    )
  }

  if (!conn.world) return <Notice title="Connected" body="Waiting for the DM." quiet />
  return <Table world={conn.world} dm={null} send={conn.send} toasts={toasts} />
}

/* Something arriving in your hands should say so. Diffing the projected
   item list is enough: the server decides who holds what, and a player
   whose list grew has just been handed something. An ordinary
   notification, because there is nothing to decide — unlike a note,
   which asks whether to pass it on. */
function useArrivals(items: { id: string; name: string }[] | undefined,
                     announce: (text: string) => void) {
  const known = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!items) return
    const ids = new Set(items.map(i => i.id))
    if (known.current === null) { known.current = ids; return }
    for (const it of items) {
      if (!known.current.has(it.id)) announce(`You received ${it.name}`)
    }
    known.current = ids
  }, [items, announce])
}

/* A clock advancing is news, and news belongs where the rest of the
   news goes rather than in a corner of its own. The first update after
   joining is the starting state, not a tick, so it is only recorded. */
function useTicks(clocks: { id: string; name: string; ticks: number | null;
                            latestText: string | null }[] | undefined,
                  announce: (text: string) => void) {
  const seen = useRef<Map<string, number> | null>(null)
  useEffect(() => {
    if (!clocks) return
    const now = new Map(clocks.map(k => [k.id, k.ticks ?? -1]))
    if (seen.current === null) { seen.current = now; return }
    for (const k of clocks) {
      const before = seen.current.get(k.id)
      const after = k.ticks ?? -1
      if (before !== undefined && after > before) {
        announce(k.latestText ? `${k.name}: ${k.latestText}` : `${k.name} advances`)
      }
    }
    seen.current = now
  }, [clocks, announce])
}

function Join({ room }: { room: string }) {
  const conn = useConnection({ t: 'join', room, role: 'table' })
  const [code, setCode] = useState(room)
  const players = conn.audiences.filter(a => a.personal)

  return (
    <div className={`join ${conn.campaign?.lobby ? 'has-art' : ''}`}>
      {conn.campaign?.lobby && (
        <img className="join-art" src={`/assets/${conn.campaign.lobby}`} alt="" draggable={false} />
      )}
      <h1>{conn.campaign?.title ?? 'Join the table'}</h1>
      <label>
        Room code
        <input value={code} onChange={e => setCode(e.target.value)} />
      </label>

      {players.length > 0 ? (
        <>
          <p className="hint">Who are you?</p>
          <div className="join-players">
            {players.map(p => (
              <a key={p.id} className="join-player"
                href={`#play?room=${encodeURIComponent(code)}&as=${encodeURIComponent(p.id)}`}>
                {p.name}
              </a>
            ))}
          </div>
        </>
      ) : (
        <p className="hint">
          {conn.status === 'open'
            ? 'This campaign declares no players.'
            : 'Looking for the table server.'}
        </p>
      )}

      <a className="join-alt" href={`#table?room=${encodeURIComponent(code)}`}>
        This screen is the shared display
      </a>
    </div>
  )
}

function Notice({ title, body, quiet }: { title: string; body: string; quiet?: boolean }) {
  return (
    <div className={`notice ${quiet ? 'is-quiet' : ''}`}>
      <h1>{title}</h1>
      <p>{body}</p>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
