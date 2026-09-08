import { TABLE, target, FIXED_GROUPS, type EntityId, type AudienceId } from '@tabletop/core'
import { useState, type ReactNode } from 'react'
import { isDM } from '../shell'
import { Section } from '../ui/Section'
import type { ShellState } from '../shell'

/* ------------------------------------------------------------------
   Items are entities, not inventory. Giving one to somebody is a
   reveal, so the same audience machinery decides who has it, who has
   merely seen it, and who knows nothing about it.
------------------------------------------------------------------ */

export function ItemsPanel({ world, dm }: ShellState) {
  const secrets = isDM(world) ? world.secrets : null
  const [q, setQ] = useState('')
  const needle = q.trim().toLowerCase()
  const hit = (name: string, group: string) =>
    !needle || name.toLowerCase().includes(needle) || group.toLowerCase().includes(needle)

  const Search = (
    <div className="panel-sticky">
      <input className="search" type="text" value={q} placeholder="Find an item"
        onChange={e => setQ(e.target.value)} />
    </div>
  )

  if (!dm) {
    if (world.items.length === 0) return <p className="empty">Nothing yet.</p>
    return (
      <div className="items">
        {Search}
        {group(world.items.filter(i => hit(i.name, i.group))).map(([g, list]) => (
          <Section key={g} id={`items:${g}`} label={g} count={list.length}>
            {list.map(it => <ItemCard key={it.id} item={it} />)}
          </Section>
        ))}
      </div>
    )
  }

  const all = dm.ir.items
  if (all.length === 0) return <p className="empty">This campaign declares no items.</p>

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

  const grouped = new Map<string, typeof all>()
  for (const it of all) {
    if (!grouped.has(it.group)) grouped.set(it.group, [])
    grouped.get(it.group)!.push(it)
  }

  return (
    <div className="items">
      {Search}
      <p className="hint">Give an item and it appears on that person's screen.</p>
      {[...grouped.entries()]
        .map(([g, list]) => [g, list.filter(it => hit(it.name, g))] as const)
        .filter(([, list]) => list.length > 0)
        .map(([g, list]) => (
        <Section key={g} id={`items:${g}`} label={g} count={list.length}>
          {list.map(it => {
            const held = audiences.filter(a => has(a.id, target(it.id as EntityId)))
            return (
              <ItemCard key={it.id} item={it} hidden={held.length === 0}>
                {secrets?.itemSecrets[it.id] && <p className="truth">{secrets.itemSecrets[it.id]}</p>}
                <div className="give">
                  {audiences.map(a => {
                    const on = has(a.id, target(it.id as EntityId))
                    return (
                      <button key={a.id} className={`chip ${on ? 'is-on' : ''}`}
                        onClick={() => give(it.id, a.id, a.name, !on)}
                        title={on ? `Take back from ${a.name}` : `Give to ${a.name}`}>
                        {a.name}
                      </button>
                    )
                  })}
                </div>
              </ItemCard>
            )
          })}
        </Section>
      ))}
    </div>
  )
}

/* One card, both roles. The DM's view is the player's view with extra
   children appended, so the two can never drift apart by accident. */
function ItemCard({
  item, hidden, children,
}: {
  item: {
    id: string; name: string
    art: string | null; text: string | null; detail: string | null
  }
  hidden?: boolean
  children?: ReactNode
}) {
  return (
    <article className={`item ${hidden ? 'is-hidden' : ''}`}>
      {item.art && <img src={`/assets/${item.art}`} alt="" />}
      <div>
        <h4>{item.name}</h4>
        {item.text && <p className="prose">{item.text}</p>}
        {item.detail && <p className="prose item-detail">{item.detail}</p>}
        {children}
      </div>
    </article>
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
