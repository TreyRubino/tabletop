import { createRoot } from 'react-dom/client'
import type { ClientMsg } from '@tabletop/core'
import { useConnection, useRoute } from './net'
import { Table } from './Table'
import { useToasts } from './ui/Toasts'
import './styles.css'

/* Two views and no third. The DM carries a key; everybody else is a
   player, and a player is not asked who they are — there is nothing on
   screen that differs between one player and the next, so there is
   nothing to choose and no lobby to choose it in. Opening the link is
   the whole of joining. */
function App() {
  const { path, params } = useRoute()
  const room = params.get('room') ?? 'table'

  if (path === 'dm') {
    return <Connected join={{ t: 'join', room, role: 'dm', dmKey: params.get('key') ?? '' }} />
  }
  return <Connected join={{ t: 'join', room, role: 'player' }} />
}

function Connected({ join }: { join: Extract<ClientMsg, { t: 'join' }> }) {
  const conn = useConnection(join)
  const { toasts, push } = useToasts()

  if (conn.status === 'denied') return <Notice title="Not letting you in" body={conn.reason ?? 'denied'} />
  if (conn.status !== 'open') return <Notice title="Connecting" body="Waiting for the table server." quiet />
  if (!conn.world) return <Notice title="Connected" body="Loading the campaign." quiet />

  return (
    <Table
      world={conn.world}
      toasts={toasts}
      dm={join.role === 'dm'
        ? { send: conn.send, undo: conn.undo, logLength: conn.logLength, toast: push }
        : null}
    />
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
