import { useState } from 'react'
import { TABLE, type PublicScene } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section, Card, Action, Find, Empty, NoMatch } from '../ui/kit'

/* ------------------------------------------------------------------
   Places. A place that contains places looks exactly like one that
   does not — same card, with one extra control that opens what is
   inside rather than turning the row into a different kind of thing.

   Depth-first and flat: the Stonehill Inn, then its upstairs, then
   the next place. Nothing goes more than two disclosures deep.

   `Row` lives out here rather than inside the panel on purpose. A
   component declared inside another is a new function on every render,
   which React reads as a different kind of component — so it threw the
   whole list away and built it again every time anything changed. That
   is why opening a cellar made the sidebar jump: every card remounted,
   and a card scrolls itself into view when it mounts selected.
------------------------------------------------------------------ */

interface RowCtx {
  dm: ShellState['dm']
  presented: string | null
  /** The place the sidebar is currently looking at. */
  on: string | null
  setViewing: ShellState['setViewing']
  setSelected: ShellState['setSelected']
  expanded: Set<string>
  toggle: (id: string) => void
  childrenOf: (id: string) => PublicScene[]
  countWithin: (id: string) => number
}

export function ScenesPanel({ world, dm, viewing, setViewing, setSelected }: ShellState) {
  const [q, setQ] = useState('')
  /* Which places are showing what is inside them. Local and transient:
     this is a glance, not a setting. */
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  if (world.scenes.length === 0) {
    return <Empty>The DM has not shown you anywhere yet.</Empty>
  }

  const needle = q.trim().toLowerCase()
  const shown = world.scenes.filter(s => !needle || s.name.toLowerCase().includes(needle))

  const parentOf = (s: PublicScene): string | null =>
    s.trail.length > 1 ? s.trail[s.trail.length - 2].id : null
  const childrenOf = (id: string) => world.scenes.filter(x => parentOf(x) === id)
  /* Everything under a place at any depth, counted but not flattened.
     The count is what the "inside" button reports; the nesting is what
     it opens. */
  const countWithin = (id: string): number =>
    childrenOf(id).reduce((n, ch) => n + 1 + countWithin(ch.id), 0)

  const ctx: RowCtx = {
    dm,
    presented: world.presented,
    on: viewing ?? world.presented,
    setViewing,
    setSelected,
    expanded,
    toggle: id => setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    }),
    childrenOf,
    countWithin,
  }

  const roots = world.scenes.filter(s => {
    const p = parentOf(s)
    return !p || !world.scenes.some(x => x.id === p)
  })

  return (
    <div className="scenes">
      {world.scenes.length > 6 && <Find what="a place" value={q} onChange={setQ} />}

      {shown.length === 0 && <NoMatch what="place" />}

      {needle
        ? shown.map(s => <Row key={s.id} s={s} ctx={ctx} />)
        : roots.map(root => {
          const places = childrenOf(root.id)
          if (places.length === 0) return <Row key={root.id} s={root} ctx={ctx} />
          return (
            <Section key={root.id} id={`scene:${root.id}`}
              label={root.name} count={places.length}>
              {/* The root's own row. Its children are the rows below it,
                  so it does not also carry an "inside" button — that
                  would list every one of them a second time. */}
              <Row s={root} ctx={ctx} listed />
              {places.map(place => <Row key={place.id} s={place} ctx={ctx} />)}
            </Section>
          )
        })}
    </div>
  )
}

function Row({ s, listed, ctx }: {
  s: PublicScene
  /** Its children are already rows of their own beside it. */
  listed?: boolean
  ctx: RowCtx
}) {
  const { dm, presented: onScreen, on, setViewing, setSelected, expanded, toggle } = ctx

  /* Only what is directly inside. A cellar under a cellar opens from
     the cellar, not from the building, so the tree on screen is the
     tree in the campaign rather than a flattened pile of everything
     below this door. */
  const within = listed ? [] : ctx.childrenOf(s.id)
  const deep = listed ? 0 : ctx.countWithin(s.id)
  const openable = within.length > 0
  const isOpen = openable && expanded.has(s.id)
  const presented = s.id === onScreen
  const here = dm
    ? Object.values(dm.session.placements).filter(p => p.scene === s.id).length
    : s.tokens.length

  /* Every party token already standing here, so the button can go
     quiet once there is nothing left for it to do. */
  const partyKinds = new Set((dm?.ir.tokenKinds ?? []).filter(k => k.party).map(k => k.id))
  const partyHere = !dm || Object.values(dm.session.placements)
    .filter(p => partyKinds.has(dm.ir.actors.find(a => a.id === p.actor)?.kind ?? ''))
    .every(p => p.scene === s.id)

  return (
    <>
      <Card
        title={s.name}
        tag={presented ? 'on screen' : undefined}
        tagTone="live"
        meta={<>
          {here > 0 ? <><strong>{here}</strong> here</> : <>nobody here</>}
          {' \u00b7 '}
          {openable
            ? <>
              <strong>{within.length}</strong> inside
              {deep > within.length && <> of <strong>{deep}</strong> below</>}
            </>
            : <>nothing inside</>}
        </>}
        body={s.description || undefined}
        active={s.id === on}
        onOpen={() => { setViewing(s.id); setSelected(null) }}
        openTitle={`Look at ${s.name}`}
        acts={<>
          {dm && (
            <Action title="Put this on every screen" disabled={presented}
              onClick={() => {
                dm.send({ t: 'present', audience: TABLE, scene: s.id as never })
                dm.toast(`Everyone is now looking at ${s.name}`)
              }}>show</Action>
          )}
          {dm && (
            <Action disabled={partyHere}
              title={partyHere
                ? 'The party is here'
                : 'Move every party token here, show it, and reveal them standing in it'}
              onClick={() => {
                dm.send({ t: 'moveParty', scene: s.id as never })
                dm.toast(`The party arrives at ${s.name}`)
              }}>move the party</Action>
          )}
          {openable && (
            <Action end on={isOpen}
              title={isOpen
                ? `Hide what is inside ${s.name}`
                : `${within.length} place${within.length === 1 ? '' : 's'} directly inside ${s.name}`}
              onClick={() => toggle(s.id)}>
              {isOpen ? 'hide inside' : `inside (${within.length})`}
            </Action>
          )}
        </>} />

      {isOpen && (
        <div className="scene-inside">
          {within.map(ch => <Row key={ch.id} s={ch} ctx={ctx} />)}
        </div>
      )}
    </>
  )
}
