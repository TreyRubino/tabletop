import { useState } from 'react'
import { TABLE, type AudienceId } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section, Card, Action, Chip, Field, Hint, Empty } from '../ui/kit'

/* ------------------------------------------------------------------
   A note is addressed to one person, and that person decides whether
   the rest of the table ever hears it. The DM can send it and can see
   it; only the recipient can share it. That is the one slice of
   authority players hold, and the server enforces it rather than
   trusting this component.

   A note is a Card wearing the same slots as a person or an item: the
   recipient's face, their name, what they did with it, and the words
   themselves as the card's prose.
------------------------------------------------------------------ */

export function NotesPanel(shell: ShellState) {
  return shell.dm ? <DMNotes {...shell} /> : <PlayerNotes {...shell} />
}

function PlayerNotes({ world, send }: ShellState) {
  const mine = world.notes.filter(n => n.mine)
  const fromOthers = world.notes.filter(n => !n.mine && n.shared)

  if (mine.length === 0 && fromOthers.length === 0) {
    return <Empty>Nothing has been told to you alone.</Empty>
  }

  return (
    <div className="notes">
      {mine.map(n => (
        <Card key={n.id}
          title="Told to you"
          tag={n.shared ? 'everyone can see it' : 'yours alone'}
          tagTone={n.shared ? 'live' : 'hidden'}
          meta={n.shared
            ? <>you passed it on{' \u00b7 '}the table has heard it</>
            : <>only you know this{' \u00b7 '}nobody else has heard it</>}
          body={n.text}
          acts={n.shared
            ? <Action onClick={() => send({ t: 'unshareNote', note: n.id })}>take it back</Action>
            : <>
              <Action onClick={() => send({ t: 'shareNote', note: n.id })}>
                tell the others
              </Action>
              <Action onClick={() => send({ t: 'seeNote', note: n.id })}>keep it</Action>
            </>} />
      ))}

      {fromOthers.length > 0 && (
        <Section id="notes:shared" label="Shared with the table" count={fromOthers.length}>
          {fromOthers.map(n => (
            <Card key={n.id}
              title="Passed to the table"
              tag="shared"
              tagTone="live"
              meta={<>somebody chose to share this{' \u00b7 '}everyone can see it</>}
              body={n.text} />
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

  /* What is on the screens right now, and what is in the box waiting to
     go there. They are only the same once you press send. */
  const showing = dm.session.banner[TABLE] ?? ''
  const [banner, setBanner] = useState(showing)
  const raise = () => {
    if (!banner.trim() || banner === showing) return
    dm.send({ t: 'banner', audience: TABLE, text: banner })
    dm.toast('Banner is up on every screen')
  }

  const send = () => {
    if (!text.trim() || !targetId) return
    dm.send({ t: 'note', audience: targetId as AudienceId, text })
    dm.toast(`Told to ${target?.name ?? targetId}. They choose whether to pass it on.`)
    setText('')
  }

  return (
    <div className="note-compose">
      {/* Composing is a card too: who it is going to, what will happen
          to it, and the words themselves where a card keeps its prose. */}
      <Card
        title={target?.name ?? 'Nobody to tell'}
        meta={<>goes to one person{' \u00b7 '}they decide who else hears it</>}
        acts={<>
          {players.map(p => (
            <Chip key={p.id} on={targetId === p.id} onClick={() => setTo(p.id)}>{p.name}</Chip>
          ))}
          <Action onClick={send} disabled={!text.trim() || !targetId}
            title={`Tell ${target?.name ?? 'them'} alone. \u2318\u23ce also sends.`}>
            send
          </Action>
        </>}>
        <Field lines={3} value={text} onChange={setText} onCommit={send}
          placeholder="You hear it before anyone else does. Something heavy, moving on the floor above." />
      </Card>

      <Section id="notes:sent" label="Everything you have sent" count={world.notes.length}>
        {world.notes.length === 0 && <Empty>Nothing sent yet.</Empty>}
        {[...world.notes].reverse().map(n => {
          const whoId = noteTarget(dm, n.id)
          const who = players.find(p => p.id === whoId)
          return (
            <Card key={n.id}
              title={who?.name ?? 'someone'}
              tag={n.shared ? 'passed it on' : n.seen ? 'kept it' : 'not read yet'}
              tagTone={n.shared ? 'live' : 'hidden'}
              meta={n.shared
                ? <>told to <strong>{who?.name ?? 'someone'}</strong>{' \u00b7 '}the table has heard it</>
                : <>told to <strong>{who?.name ?? 'someone'}</strong>{' \u00b7 '}the table has not heard it</>}
              body={n.text}
              acts={
                <Action danger onClick={() => dm.send({ t: 'dropNote', note: n.id })}>
                  remove
                </Action>
              } />
          )
        })}
      </Section>

      <Section id="notes:banner" label="Banner" count={showing ? 1 : 0}>
        <Card
          title="Across every screen"
          tag={showing ? 'showing now' : undefined}
          tagTone="live"
          meta={showing
            ? <>the map is covered{' \u00b7 '}clear it to give the map back</>
            : <>nothing showing{' \u00b7 '}type it, then send it</>}
          acts={<>
            <Action disabled={!banner.trim() || banner === showing}
              title="Put this over every player screen"
              onClick={raise}>send</Action>
            {showing && (
              <Action danger title="Give the map back"
                onClick={() => {
                  dm.send({ t: 'banner', audience: TABLE, text: null })
                  setBanner('')
                  dm.toast('Banner cleared')
                }}>clear it</Action>
            )}
          </>}>
          {/* Typed here and held here. A banner that appeared keystroke
              by keystroke put half-written sentences on every screen at
              the table. */}
          <Field value={banner} onChange={setBanner} onCommit={raise}
            placeholder="For a hard cut, or a held moment." />
        </Card>
      </Section>

    </div>
  )
}

/* The DM's projected notes do not carry a target, because for every
   other viewer that would be a leak. Read it off session state. */
const noteTarget = (dm: NonNullable<ShellState['dm']>, id: number): string | undefined =>
  dm.session.notes.find(n => n.id === id)?.to
