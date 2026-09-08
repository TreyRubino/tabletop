import { useState } from 'react'
import { TABLE, type AudienceId } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section } from '../ui/Section'

/* ------------------------------------------------------------------
   A note is addressed to one person, and that person decides whether
   the rest of the table ever hears it. The DM can send it and can see
   it; only the recipient can share it. That is the one slice of
   authority players hold, and the server enforces it rather than
   trusting this component.
------------------------------------------------------------------ */

export function NotesPanel(shell: ShellState) {
  return shell.dm ? <DMNotes {...shell} /> : <PlayerNotes {...shell} />
}

function PlayerNotes({ world, send }: ShellState) {
  const mine = world.notes.filter(n => n.mine)
  const fromOthers = world.notes.filter(n => !n.mine && n.shared)

  if (mine.length === 0 && fromOthers.length === 0) {
    return <p className="empty">Nothing has been told to you alone.</p>
  }

  return (
    <div className="notes">
      {mine.map(n => (
        <article key={n.id} className={`note ${n.shared ? 'is-shared' : 'is-private'}`}>
          <p className="prose">{n.text}</p>
          <footer>
            {n.shared ? (
              <>
                <span className="note-state">Everyone can see this</span>
                <button className="ghost" onClick={() => send({ t: 'unshareNote', note: n.id })}>
                  take it back
                </button>
              </>
            ) : (
              <>
                <span className="note-state">Only you know this</span>
                <button className="note-share" onClick={() => send({ t: 'shareNote', note: n.id })}>
                  tell the others
                </button>
                <button className="ghost" onClick={() => send({ t: 'seeNote', note: n.id })}>
                  keep it
                </button>
              </>
            )}
          </footer>
        </article>
      ))}

      {fromOthers.length > 0 && (
        <Section id="notes:shared" label="Shared with the table" count={fromOthers.length}>
          {fromOthers.map(n => (
            <article key={n.id} className="note is-relayed">
              <p className="prose">{n.text}</p>
            </article>
          ))}
        </Section>
      )}
    </div>
  )
}

function DMNotes({ world, dm }: ShellState) {
  const [text, setText] = useState('')
  const [to, setTo] = useState<string>('')
  if (!dm) return null

  const players = dm.ir.audiences.filter(a => a.personal)
  const targetId = to || players[0]?.id
  const target = players.find(p => p.id === targetId)

  const send = () => {
    if (!text.trim() || !targetId) return
    dm.send({ t: 'note', audience: targetId as AudienceId, text })
    dm.toast(`Told to ${target?.name ?? targetId}. They choose whether to pass it on.`)
    setText('')
  }

  return (
    <div className="note-compose">
      <p className="hint">
        Goes to one person only. They decide whether the rest of the table
        ever hears it — you cannot decide that for them.
      </p>

      <div className="note-to">
        {players.map(p => (
          <button key={p.id} className={`chip ${targetId === p.id ? 'is-on' : ''}`}
            onClick={() => setTo(p.id)}>{p.name}</button>
        ))}
      </div>

      <textarea rows={3} value={text}
        placeholder="You hear it before anyone else does. Something heavy, moving on the floor above."
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send() }} />
      <div className="row">
        <button className="primary" onClick={send} disabled={!text.trim() || !targetId}>
          send to {target?.name ?? 'nobody'}
        </button>
        <span className="hint">or {'\u2318'}\u23ce</span>
      </div>

      <Section id="notes:sent" label="Everything you have sent" count={world.notes.length}>
        {world.notes.length === 0 && <p className="empty">Nothing yet.</p>}
        {[...world.notes].reverse().map(n => {
          const who = players.find(p => p.id === noteTarget(dm, n.id))
          return (
            <article key={n.id} className={`note ${n.shared ? 'is-shared' : 'is-private'}`}>
              <header>
                <span className="note-who">{who?.name ?? 'someone'}</span>
                <span className="note-state">
                  {n.shared ? 'passed it on' : n.seen ? 'kept it' : 'not read yet'}
                </span>
              </header>
              <p>{n.text}</p>
              <button className="ghost" onClick={() => dm.send({ t: 'dropNote', note: n.id })}>
                remove
              </button>
            </article>
          )
        })}
      </Section>

      <Section id="notes:banner" label="Banner">
        <p className="hint">
          Full-screen text over every player screen. For a hard cut, or a
          held moment. Clear it to give the map back.
        </p>
        <input type="text" value={dm.session.banner[TABLE] ?? ''}
          placeholder="type, and it appears"
          onChange={e => dm.send({
            t: 'banner', audience: TABLE,
            text: e.target.value.trim() ? e.target.value : null,
          })} />
      </Section>
    </div>
  )
}

/* The DM's projected notes do not carry a target, because for every
   other viewer that would be a leak. Read it off session state. */
const noteTarget = (dm: NonNullable<ShellState['dm']>, id: number): string | undefined =>
  dm.session.notes.find(n => n.id === id)?.to
