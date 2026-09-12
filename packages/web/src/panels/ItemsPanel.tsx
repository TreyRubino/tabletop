import { TABLE, target, FIXED_GROUPS, type EntityId, type AudienceId } from '@tabletop/core'
import { useState } from 'react'
import { isDM } from '../shell'
import type { ShellState } from '../shell'
import { Section, Card, Chip, Find, Hint, Empty, NoMatch } from '../ui/kit'

/* ------------------------------------------------------------------
   Items are entities, not inventory. Giving one to somebody is a
   reveal, so the same audience machinery decides who has it, who has
   merely seen it, and who knows nothing about it.

   An item is a Card, built exactly as a person is built in People: a
   picture, a name, a status, a line saying where it stands, its prose,
   the DM's truth, and its controls. Every slot is filled from the
   item's own data — an item with no holder says so rather than
   dropping the line and standing shorter than the card above it.
------------------------------------------------------------------ */

export function ItemsPanel({ world, dm, selectedItem, setSelectedItem }: ShellState) {
  const secrets = isDM(world) ? world.secrets : null
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const hit = (name: string, group: string) =>
    !needle || name.toLowerCase().includes(needle) || group.toLowerCase().includes(needle)

  const open = (id: string) => setSelectedItem(id)

  /* ---- the player's shelf: only what has been given to them ---- */
  if (!dm) {
    if (world.items.length === 0) {
      return <Empty>Nothing has been given to you yet.</Empty>
    }
    const shown = world.items.filter(i => hit(i.name, i.group))
    return (
      <div className="items">
        <Find what="an item" value={q} onChange={setQ} />
        {shown.length === 0 && <NoMatch what="item" />}
        {group(shown).map(([g, list]) => (
          <Section key={g} id={`items:${g}`} label={g} count={list.length}>
            {list.map(it => (
              <Card key={it.id}
                title={it.name}
                tag="yours"
                tagTone="live"
                meta={<>given to you{' \u00b7 '}in <strong>{it.group}</strong></>}
                body={it.text || undefined}
                active={selectedItem === it.id}
                onOpen={() => open(it.id)}
                openTitle={`Look closer at ${it.name}`} />
            ))}
          </Section>
        ))}
      </div>
    )
  }

  /* ---- the DM's shelf: everything, and who holds it ---- */
  const all = dm.ir.items
  if (all.length === 0) return <Empty>This campaign declares no items.</Empty>

  const audiences: { id: AudienceId; name: string }[] = [
    { id: TABLE, name: 'Everyone' },
    ...dm.ir.audiences.filter(a => a.personal).map(a => ({ id: a.id, name: a.name })),
  ]
  const has = (a: AudienceId, t: string) => (dm.session.reveals[a] ?? []).includes(t)

  const give = (itemId: string, a: AudienceId, name: string, on: boolean) => {
    const targets = FIXED_GROUPS.item.map(g => target(itemId as EntityId, g))
    dm.send(on
      ? { t: 'reveal', audience: a, targets }
      : { t: 'conceal', audience: a, targets })
    const item = dm.ir.items.find(i => i.id === itemId)
    dm.toast(on ? `${item?.name} given to ${name}` : `${item?.name} taken back from ${name}`)
  }

  const groups = group(all.filter(it => hit(it.name, it.group)))

  return (
    <div className="items">
      <Find what="an item" value={q} onChange={setQ} />
      <Hint>Give an item and it appears on that person's screen.</Hint>

      {groups.length === 0 && <NoMatch what="item" />}

      {groups.map(([g, list]) => (
        <Section key={g} id={`items:${g}`} label={g} count={list.length}>
          {list.map(it => {
            const held = audiences.filter(a => has(a.id, target(it.id as EntityId)))
            const nobody = held.length === 0
            return (
              <Card key={it.id}
                title={it.name}
                tag={nobody ? 'nobody has it' : undefined}
                tagTone="hidden"
                meta={<>
                  {nobody
                    ? <>held by nobody</>
                    : <>held by <strong>{held.map(a => a.name).join(', ')}</strong></>}
                  {' \u00b7 '}in <strong>{it.group}</strong>
                </>}
                body={it.text || undefined}
                hidden={nobody}
                active={selectedItem === it.id}
                onOpen={() => open(it.id)}
                openTitle={`Look closer at ${it.name}`}
                acts={audiences.map(a => {
                  const on = has(a.id, target(it.id as EntityId))
                  return (
                    <Chip key={a.id} on={on}
                      onClick={() => give(it.id, a.id, a.name, !on)}
                      title={on ? `Take back from ${a.name}` : `Give to ${a.name}`}>
                      {a.name}
                    </Chip>
                  )
                })} />
            )
          })}
        </Section>
      ))}
    </div>
  )
}

function group<T extends { group: string }>(list: T[]): [string, T[]][] {
  const m = new Map<string, T[]>()
  for (const x of list) {
    if (!m.has(x.group)) m.set(x.group, [])
    m.get(x.group)!.push(x)
  }
  return [...m.entries()]
}
