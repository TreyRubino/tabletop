import {
  TABLE, PRESENCE, IDENTITY, HEALTH, target, groupsFor, findTokenKind, findActor,
  type EntityId, type AudienceId, type Group,
} from '@tabletop/core'
import { activeScene } from '../shell'
import type { ShellState } from '../shell'
import { Section } from '../ui/Section'

/* Rows are targets, columns are audiences. One click, one reveal, no
   dialogs. Column headers reveal everything in the scene at once,
   because that is what happens when a scene actually opens. */

interface Row {
  id: string; label: string; detail: string | null; groups: Group[]
  /** Which pile this row belongs to, so the panel can sort itself. */
  bin: 'scene' | 'text' | 'here' | 'ways'
}

export function RevealsPanel({ world, dm, viewing, setSelected }: ShellState) {
  if (!dm) return null
  const scene = activeScene(world, viewing)
  if (!scene) return <p className="empty">No scene on screen.</p>

  const ir = dm.ir
  const irScene = ir.scenes.find(s => s.id === scene.id)

  const placedHere = Object.entries(dm.session.placements)
    .filter(([, p]) => p.scene === scene.id)

  const rows: Row[] = [
    { id: scene.id, label: scene.name, detail: 'the place itself', bin: 'scene', groups: groupsFor(ir, 'scene') },
    ...(irScene?.entries ?? []).map(e => ({
      id: e.id as string,
      label: e.text ?? e.label ?? e.id,
      detail: e.style === 'read' ? 'read aloud' : e.image ? 'image' : null,
      bin: 'text' as const,
      groups: groupsFor(ir, 'entry'),
    })),
    ...placedHere.map(([pid, p]) => {
      const actor = findActor(ir, p.actor)
      const kind = actor ? findTokenKind(ir, actor.kind) : null
      return {
        id: pid,
        label: p.label ?? actor?.name ?? pid,
        detail: kind?.label ?? null,
        bin: 'here' as const,
        groups: groupsFor(ir, 'placement', actor?.kind),
      }
    }),
    ...ir.scenes.filter(s => s.pin?.parent === scene.id).map(s => ({
      id: s.id as string, label: s.name, detail: 'pin on this map',
      bin: 'ways' as const, groups: groupsFor(ir, 'scene'),
    })),
  ]

  const audiences: { id: AudienceId; name: string }[] = [
    { id: TABLE, name: 'All' },
    ...ir.audiences.filter(a => a.personal).map(a => ({ id: a.id, name: a.name })),
  ]

  const has = (a: AudienceId, t: string) => (dm.session.reveals[a] ?? []).includes(t)
  const toggle = (a: AudienceId, t: string) => dm.send(has(a, t)
    ? { t: 'conceal', audience: a, targets: [t] }
    : { t: 'reveal', audience: a, targets: [t] })

  const all = (a: AudienceId, on: boolean) => {
    const targets = rows.flatMap(r => r.groups.map(g => target(r.id as EntityId, g)))
    dm.send(on
      ? { t: 'reveal', audience: a, targets }
      : { t: 'conceal', audience: a, targets })
    const who = audiences.find(x => x.id === a)?.name ?? a
    dm.toast(on ? `Everything here shown to ${who}` : `Everything here hidden from ${who}`)
  }

  return (
    <div className="matrix">
      <div className="panel-sticky">
        <div className="matrix-head">
          <span>{scene.name}</span>
          <div className="matrix-cols">
            {audiences.map(a => (
              <button key={a.id} className="matrix-col" title={`Reveal everything here to ${a.name}`}
                onClick={() => all(a.id, true)}>{a.name.slice(0, 2)}</button>
            ))}
          </div>
        </div>
      </div>

      <p className="hint">
        A filled square means that audience knows it. Columns above set
        everything at once.
      </p>

      <div className="matrix-bulk">
        <button className="ghost" onClick={() => all(TABLE, true)}>show it all to everyone</button>
        <button className="ghost" onClick={() => all(TABLE, false)}>hide it all again</button>
      </div>

      {BINS.map(([bin, title]) => {
        const list = rows.filter(r => r.bin === bin)
        if (list.length === 0) return null
        return (
          <Section key={bin} id={`reveals:${bin}`} label={title} count={list.length}>
            {list.map(row => renderRow(row))}
          </Section>
        )
      })}
    </div>
  )

  function renderRow(row: Row) {
    return (
        <div key={row.id} className="matrix-row">
          <button className="matrix-label" onClick={() => setSelected(row.id)}>
            <span className="matrix-title">{row.label}</span>
            {row.detail && <span className="matrix-detail">{row.detail}</span>}
          </button>
          {row.groups.map(g => (
            <div key={g} className="matrix-group">
              <span className="matrix-group-name">{groupLabel(g)}</span>
              <div className="matrix-cols">
                {audiences.map(a => {
                  const t = target(row.id as EntityId, g)
                  const on = has(a.id, t)
                  return (
                    <button key={a.id} className={`cell ${on ? 'is-on' : ''}`}
                      onClick={() => toggle(a.id, t)}
                      title={`${g} \u2192 ${a.name}`} aria-pressed={on} />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
    )
  }
}

const BINS: [Row['bin'], string][] = [
  ['scene', 'The place itself'],
  ['text', 'What is written here'],
  ['here', 'Who and what is here'],
  ['ways', 'Places you can reach from here'],
]

const LABELS: Record<string, string> = {
  [PRESENCE]: 'on screen', [IDENTITY]: 'who it is', [HEALTH]: 'health',
  description: 'description', stage: 'current step', track: 'the track',
}
const groupLabel = (g: Group) => LABELS[g] ?? g
