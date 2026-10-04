import { useMemo, useState } from 'react'
import { findTokenKind, type Actor } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section, Card, Action, Find, Hint, Empty, NoMatch } from '../ui/kit'

/* ------------------------------------------------------------------
   The roster. Every actor the campaign declares, grouped as the
   campaign grouped them, searchable, and armed with one click.

   Arm-then-place rather than drag: it works on a trackpad, it works on
   touch, it survives a mis-drag, and the armed state is visible in the
   canvas the whole time so it is never ambiguous what a click will do.

   A creature waiting to be placed is the same card as a creature
   already standing somewhere, because it is the same creature. Armed
   is the card's selected state, which is the same highlight selection
   wears everywhere else.
------------------------------------------------------------------ */

export function RosterPanel({ dm, arming, setArming, world, viewing }: ShellState) {
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    if (!dm) return []
    const needle = q.trim().toLowerCase()
    const match = (a: Actor) =>
      !needle
      || a.name.toLowerCase().includes(needle)
      || a.group.toLowerCase().includes(needle)
      || a.kind.toLowerCase().includes(needle)

    const out = new Map<string, Actor[]>()
    for (const a of dm.ir.actors) {
      if (a.hidden || !match(a)) continue
      if (!out.has(a.group)) out.set(a.group, [])
      out.get(a.group)!.push(a)
    }
    return [...out.entries()]
  }, [dm, q])

  if (!dm) return null

  const scene = viewing ?? world.presented
  const sceneName = world.scenes.find(s => s.id === scene)?.name ?? 'nowhere'

  const placedCount = (actorId: string) =>
    Object.values(dm.session.placements).filter(p => p.actor === actorId).length

  return (
    <div className="roster">
      <Find what="a creature" value={q} onChange={setQ} />

      {arming ? (
        <div className="arm-note">
          <span>Click the map to place it on <strong>{sceneName}</strong>.</span>
          <Action onClick={() => setArming(null)}>cancel</Action>
        </div>
      ) : (
        <Hint>Pick something, then click where it goes.</Hint>
      )}

      {groups.length === 0 && <NoMatch what="creature" />}

      {groups.map(([group, actors]) => (
        <Section key={group} id={`roster:${group}`} label={group} count={actors.length}>
          {actors.map(a => {
            const kind = findTokenKind(dm.ir, a.kind)
            const n = placedCount(a.id)
            const armed = arming === a.id
            return (
              <Card key={a.id}
                title={a.name}
                tag={n > 0 ? `${n} on the table` : undefined}
                tagTone="live"
                meta={<>
                  <strong>{kind?.label ?? a.kind}</strong>
                  {' \u00b7 '}
                  {armed ? <>waiting for a click on {sceneName}</> : <>ready to place</>}
                </>}
                body={a.entries?.look?.text || undefined}
                active={armed}
                onOpen={() => setArming(armed ? null : a.id)}
                openTitle={armed ? 'Put it down again' : `Place ${a.name} on ${sceneName}`} />
            )
          })}
          {actors.length === 0 && <Empty>Nothing in this group.</Empty>}
        </Section>
      ))}
    </div>
  )
}
