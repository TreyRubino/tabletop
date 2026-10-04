import { useState } from 'react'
import type { PublicScene } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Card, Action, Find, Empty, NoMatch } from '../ui/kit'

/* ------------------------------------------------------------------
   Scenes. A scene that contains scenes looks exactly like one that
   does not — same card, with one extra control that opens what is
   inside rather than turning the row into a different kind of thing.

   Depth-first and flat: the session, then each of its parts, then
   the next one. Nothing goes more than two disclosures deep.

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
  /** The scene the sidebar is currently looking at. */
  on: string | null
  setViewing: ShellState['setViewing']
  expanded: Set<string>
  toggle: (id: string) => void
  childrenOf: (id: string) => PublicScene[]
  countWithin: (id: string) => number
}

export function ScenesPanel({ world, dm, viewing, setViewing }: ShellState) {
  const [q, setQ] = useState('')
  /* Which scenes are showing what is inside them. Local and transient:
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
  /* Everything under a scene at any depth, counted but not flattened.
     The count is what the "inside" button reports; the nesting is what
     it opens. */
  const countWithin = (id: string): number =>
    childrenOf(id).reduce((n, ch) => n + 1 + countWithin(ch.id), 0)

  const ctx: RowCtx = {
    dm,
    presented: world.presented,
    on: viewing ?? world.presented,
    setViewing,
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
      {world.scenes.length > 6 && <Find what="a scene" value={q} onChange={setQ} />}

      {shown.length === 0 && <NoMatch what="scene" />}

      {/* Every scene is a row, and a row that holds scenes carries the
          "inside" button that opens them beneath it. Master wrapped a
          top-level place in a section instead, because it had exactly
          one — a whole region holding twenty places, which is a group
          and reads as one. Here the top level is the night itself,
          eight scenes in the order they happen, and a section around
          three of them would be a heading over a list of one. The
          disclosure is the same disclosure either way. */}
      {(needle ? shown : roots).map(s => <Row key={s.id} s={s} ctx={ctx} />)}
    </div>
  )
}

function Row({ s, listed, ctx }: {
  s: PublicScene
  /** Its children are already rows of their own beside it. */
  listed?: boolean
  ctx: RowCtx
}) {
  const { dm, presented: onScreen, on, setViewing, expanded, toggle } = ctx

  /* Only what is directly inside. A part inside a part opens from
     that part, not from the one above it, so the tree on screen is the
     tree in the campaign rather than a flattened pile of everything
     below it. */
  const within = listed ? [] : ctx.childrenOf(s.id)
  const deep = listed ? 0 : ctx.countWithin(s.id)
  const openable = within.length > 0
  const isOpen = openable && expanded.has(s.id)
  const presented = s.id === onScreen
  /* The same slot the token count used to fill. A scene has one
     number worth reporting and this is it. */
  const here = s.images.length

  return (
    <>
      <Card
        title={s.name}
        tag={presented ? 'on screen' : undefined}
        tagTone="live"
        meta={<>
          {here > 0
            ? <><strong>{here}</strong> picture{here === 1 ? '' : 's'}</>
            : <>no pictures</>}
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
        onOpen={() => setViewing(s.id)}
        openTitle={`Look at ${s.name}`}
        acts={<>
          {dm && (
            <Action title="Put this on every screen" disabled={presented}
              onClick={() => {
                dm.send({ t: 'present', scene: s.id as never })
                dm.toast(`Everyone is now looking at ${s.name}`)
              }}>show</Action>
          )}
          {openable && (
            <Action end on={isOpen}
              title={isOpen
                ? `Hide what is inside ${s.name}`
                : `${within.length} scene${within.length === 1 ? '' : 's'} directly inside ${s.name}`}
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
