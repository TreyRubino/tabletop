import { useMemo, useState } from 'react'
import { findTokenKind, type Actor } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section } from '../ui/Section'

/* ------------------------------------------------------------------
   The roster. Every actor the campaign declares, grouped as the
   campaign grouped them, searchable, and armed with one click.

   Arm-then-place rather than drag: it works on a trackpad, it works on
   touch, it survives a mis-drag, and the armed state is visible in the
   canvas the whole time so it is never ambiguous what a click will do.
------------------------------------------------------------------ */

export function RosterPanel({ dm, arming, setArming, world, viewing }: ShellState) {
  const [q, setQ] = useState('')
  if (!dm) return null

  const scene = viewing ?? world.presented
  const sceneName = world.scenes.find(s => s.id === scene)?.name ?? 'nowhere'

  const groups = useMemo(() => {
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
  }, [dm.ir.actors, q])

  const placedCount = (actorId: string) =>
    Object.values(dm.session.placements).filter(p => p.actor === actorId).length

  return (
    <div className="roster">
      <div className="panel-sticky">
        <input
          className="search"
          type="text"
          value={q}
          placeholder="Search the roster"
          onChange={e => setQ(e.target.value)}
        />
      </div>

      {arming ? (
        <div className="arm-note">
          <span>Click the map to place it on <strong>{sceneName}</strong>.</span>
          <button className="ghost" onClick={() => setArming(null)}>cancel</button>
        </div>
      ) : (
        <p className="hint">Pick something, then click where it goes.</p>
      )}

      {groups.length === 0 && <p className="empty">Nothing matches.</p>}

      {groups.map(([group, actors]) => (
        <Section key={group} id={`roster:${group}`} label={group} count={actors.length}>
          <div className="roster-grid">
            {actors.map(a => {
              const kind = findTokenKind(dm.ir, a.kind)
              const n = placedCount(a.id)
              return (
                <button
                  key={a.id}
                  className={`roster-item ${arming === a.id ? 'is-armed' : ''}`}
                  style={{ ['--tok' as string]: kind?.accent ?? '#8f9bb0' }}
                  onClick={() => setArming(arming === a.id ? null : a.id)}
                  title={kind?.label ?? a.kind}
                >
                  <span className={`roster-chip tok-${kind?.shape ?? 'disc'}`}>
                    <span className="roster-fill">
                      {a.art
                        ? <img src={`/assets/${a.art}`} alt="" />
                        : <em>{initials(a.name)}</em>}
                    </span>
                  </span>
                  <span className="roster-name">{a.name}</span>
                  {n > 0 && <span className="roster-count" title={`${n} on the table`}>{n}</span>}
                </button>
              )
            })}
          </div>
        </Section>
      ))}
    </div>
  )
}

const initials = (name: string) =>
  name.replace(/^The\s+/i, '').split(' ').map(w => w[0]).join('').slice(0, 2)
