import { useState } from 'react'
import { TABLE, target, type EntityId } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section } from '../ui/Section'

export function ScenesPanel({ world, dm, viewing, setViewing, setSelected }: ShellState) {
  const [q, setQ] = useState('')
  /* Which places are showing what is inside them. Local and transient:
     this is a glance, not a setting. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  if (world.scenes.length === 0) {
    return <p className="empty">The DM has not shown you anywhere yet.</p>
  }

  const needle = q.trim().toLowerCase()
  const shown = world.scenes.filter(s => !needle || s.name.toLowerCase().includes(needle))
  const on = viewing ?? world.presented

  const parentOf = (s: typeof shown[number]): string | null =>
    s.trail.length > 1 ? s.trail[s.trail.length - 2].id : null
  const childrenOf = (id: string) => world.scenes.filter(x => parentOf(x) === id)

  /* The list goes two deep and stops: the root map holds its places,
     and a place holds the places inside it. Anything deeper is a floor
     of a building, and floors are reached the way you would reach them
     in the fiction — by the marker on the map you are standing on —
     rather than by teleporting from a list. */
  const roots = world.scenes.filter(s => {
    const p = parentOf(s)
    return !p || !world.scenes.some(x => x.id === p)
  })

  return (
    <div className="scenes">
      {world.scenes.length > 6 && (
        <div className="panel-sticky">
          <input className="search" type="text" value={q} placeholder="Find a place"
            onChange={e => setQ(e.target.value)} />
        </div>
      )}

      {shown.length === 0 && <p className="empty">Nothing matches.</p>}

      {needle
        ? shown.map(s => <Row key={s.id} s={s} />)
        : roots.map(root => {
          const places = childrenOf(root.id)
          if (places.length === 0) return <Row key={root.id} s={root} />
          return (
            <Section key={root.id} id={`scene:${root.id}`}
              label={root.name} count={places.length}>
              <Row s={root} />
              {places.map(place => (
                <Row key={place.id} s={place} inside={childrenOf(place.id)} />
              ))}
            </Section>
          )
        })}
    </div>
  )

  function Row({
    s, inside,
  }: {
    s: typeof shown[number]
    /** Places within this one, revealed by the button on the row. */
    inside?: typeof shown
  }) {
    const presented = s.id === world.presented
    const here = Object.values(dm?.session.placements ?? {}).filter(p => p.scene === s.id).length
    /* Every party token already standing here, so the button can go
       quiet once there is nothing left for it to do. */
    const partyKinds = new Set((dm?.ir.tokenKinds ?? []).filter(k => k.party).map(k => k.id))
    const partyHere = !dm || Object.values(dm.session.placements)
      .filter(p => partyKinds.has(dm.ir.actors.find(a => a.id === p.actor)?.kind ?? ''))
      .every(p => p.scene === s.id)
    const openable = (inside?.length ?? 0) > 0
    const isOpen = openable && expanded.has(s.id)

    return (
      <>
        <div className={`scene-row ${s.id === on ? 'is-active' : ''}`}>
          <button className="scene-open"
            onClick={() => { setViewing(s.id); setSelected(null) }}>
            <span className="scene-name">{s.name}</span>
            <span className="scene-meta">
              {dm ? (here > 0 && <em>{here} tokens</em>) : (s.tokens.length > 0 && <em>{s.tokens.length} tokens</em>)}
              {presented && <em className="live">on screen</em>}
            </span>
          </button>


          {dm && (
            <button className="scene-push" title="Put this on every screen" disabled={presented}
              onClick={() => {
                dm.send({ t: 'present', audience: TABLE, scene: s.id as never })
                dm.toast(`Everyone is now looking at ${s.name}`)
              }}>show</button>
          )}

          {dm && (
            <button className="scene-push" disabled={partyHere}
              title={partyHere
                ? 'The party is here'
                : 'Move every party token here, show it, and reveal them standing in it'}
              onClick={() => {
                dm.send({ t: 'moveParty', scene: s.id as never })
                dm.toast(`The party arrives at ${s.name}`)
              }}>move</button>
          )}

          {openable && (
            <button className={`scene-into ${isOpen ? 'is-on' : ''}`}
              aria-expanded={isOpen}
              title={isOpen
                ? `Hide what is inside ${s.name}`
                : `${inside!.length} place${inside!.length === 1 ? '' : 's'} inside ${s.name}`}
              onClick={() => setExpanded(prev => {
                const next = new Set(prev)
                next.has(s.id) ? next.delete(s.id) : next.add(s.id)
                return next
              })}>
              <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor"
                strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="m6 9 6 6 6-6" />
              </svg>
              <span>{inside!.length}</span>
            </button>
          )}
        </div>

        {isOpen && (
          <div className="scene-inside">
            {inside!.map(ch => <Row key={ch.id} s={ch} />)}
          </div>
        )}
      </>
    )
  }
}
