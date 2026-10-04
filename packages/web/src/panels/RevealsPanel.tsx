import {
  TABLE, PRESENCE, IDENTITY, HEALTH, target, groupsFor, findTokenKind, findActor,
  type EntityId, type AudienceId, type Group,
} from '@tabletop/core'
import { useState } from 'react'
import { activeScene, isDM } from '../shell'
import type { ShellState } from '../shell'
import { Section, Find, Acts, Action, Hint, Empty, NoMatch } from '../ui/kit'

/* Rows are targets, columns are audiences. One click, one reveal, no
   dialogs. Column headers reveal everything in the scene at once,
   because that is what happens when a scene actually opens. */

interface Row {
  id: string; label: string; detail: string | null; groups: Group[]
  /** Which pile this row belongs to, so the panel can sort itself. */
  bin: 'scene' | 'text' | 'here' | 'ways' | 'rolls'
  /* Most rows own their targets: one per group, named after the row.
     A check does not — it grants a list the campaign wrote. Naming that
     list here lets a check be an ordinary row rather than a second kind
     of thing with its own layout. */
  grant?: string[]
  /** For a check: what the players are told when it lands. */
  says?: string
  /* A row that is a token standing on this map can also be copied and
     taken away. Nothing else on the page can, so nothing else sets it. */
  token?: { name: string; actor: string; scene: string; x: number; y: number }
}

export function RevealsPanel({ world, dm, viewing, setSelected }: ShellState) {
  /* Before the early returns below: this panel bails out when there is
     no DM and no scene, and a hook cannot sit after a return. */
  const [q, setQ] = useState('')

  if (!dm) return null
  const scene = activeScene(world, viewing)
  if (!scene) return <Empty>No scene on screen.</Empty>

  const ir = dm.ir
  const irScene = ir.scenes.find(s => s.id === scene.id)

  /* A check is a reveal with a die roll in front of it, so it is a row
     like any other, scoped to the place on screen like any other. */
  const checks = isDM(world) ? world.secrets.sceneChecks[scene.id] ?? [] : []

  /* The party first, then everything else, each run alphabetical. A DM
     scanning this list is looking for a player nine times in ten, and
     they are the only names that do not change from session to session,
     so they get the top of the list rather than wherever the letter of
     a monster's name happens to put them. */
  const placedHere = Object.entries(dm.session.placements)
    .filter(([, p]) => p.scene === scene.id)
    .map(([pid, p]) => {
      const actor = findActor(ir, p.actor)
      const kind = actor ? findTokenKind(ir, actor.kind) : null
      return { pid, p, actor, kind, name: p.label ?? actor?.name ?? pid }
    })
    .sort((a, b) =>
      Number(!!b.kind?.party) - Number(!!a.kind?.party)
      || a.name.localeCompare(b.name))

  /* Every target any check on this map grants. An entry that a roll
     hands over is not loose lore the DM releases as the party poke
     about: it belongs to its check and is shown there, once, with the
     words attached. Listing it in both places is what made this page
     impossible to read. */
  const byRoll = new Set(checks.flatMap(k => k.reveals.map(t => t.split('#')[0])))

  const rows: Row[] = [
    { id: scene.id, label: scene.name, detail: 'the place itself', bin: 'scene', groups: groupsFor(ir, 'scene') },
    ...(irScene?.entries ?? []).filter(e => !byRoll.has(e.id as string)).map(e => ({
      id: e.id as string,
      label: e.text ?? e.label ?? e.id,
      detail: e.style === 'read' ? 'read aloud' : e.image ? 'image' : null,
      bin: 'text' as const,
      groups: groupsFor(ir, 'entry'),
    })),
    ...placedHere.map(({ pid, p, actor, kind, name }) => ({
      id: pid,
      label: name,
      detail: kind?.label ?? null,
      bin: 'here' as const,
      groups: groupsFor(ir, 'placement', actor?.kind),
      token: { name, actor: p.actor as string, scene: p.scene as string, x: p.x, y: p.y },
    })),
    ...ir.scenes.filter(s => s.pin?.parent === scene.id).map(s => ({
      id: s.id as string, label: s.name, detail: 'pin on this map',
      bin: 'ways' as const, groups: groupsFor(ir, 'scene'),
    })),
    ...checks.map(k => ({
      id: k.id,
      label: k.dc !== null ? `${k.skill} ${k.dc}` : k.skill,
      detail: k.when || null,
      bin: 'rolls' as const,
      groups: [PASS],
      grant: k.reveals,
      says: k.success,
    })),
  ]

  /* Search narrows the rows, not the bins. A heading that survives with
     one row under it still says what that row is, which is the whole
     reason the page is grouped. */
  const needle = q.trim().toLowerCase()
  const shown = needle
    ? rows.filter(r =>
      r.label.toLowerCase().includes(needle)
      || (r.detail ?? '').toLowerCase().includes(needle))
    : rows

  const audiences: { id: AudienceId; name: string }[] = [
    { id: TABLE, name: 'All' },
    ...ir.audiences.filter(a => a.personal).map(a => ({ id: a.id, name: a.name })),
  ]

  /* A campaign's own name for each of its groups. A token kind already
     labels every field it carries — "What people say", "On closer
     inspection" — and that label is the cue for when to hand it over.
     Printing the bare group id instead left the DM reading "hearsay"
     and guessing. Reserved groups keep the labels below; anything the
     campaign invented is named by the campaign. */
  const groupLabel = (g: Group): string => {
    if (LABELS[g]) return LABELS[g]
    for (const k of ir.tokenKinds) {
      const e = k.entries.find(x => x.group === g)
      if (e?.label) return e.label
    }
    return g
  }

  const has = (a: AudienceId, t: string) => (dm.session.reveals[a] ?? []).includes(t)
  const set = (a: AudienceId, targets: string[], on: boolean) => dm.send(on
    ? { t: 'reveal', audience: a, targets }
    : { t: 'conceal', audience: a, targets })

  /** Copy a token where it stands, or take it off the table. */
  const copyToken = (t: NonNullable<Row['token']>) => {
    dm.send({
      t: 'place', actor: t.actor as never, scene: t.scene as never,
      x: Math.min(0.96, t.x + 0.04), y: Math.min(0.96, t.y + 0.04),
    })
    dm.toast(`Another ${t.name} placed`)
  }
  const dropToken = (id: string, name: string) => {
    dm.send({ t: 'unplace', placement: id as never })
    setSelected(null)
    dm.toast(`${name} removed. Undo puts it back.`)
  }
  const all = (a: AudienceId, on: boolean) => {
    /* Same rule the squares use: a row grants what the campaign wrote
       when it says so, and one target per group otherwise. A check whose
       targets came from `grant` would otherwise be skipped here while
       its own square worked, which is exactly the kind of split the
       page exists to avoid. */
    const targets = rows.flatMap(r => r.grant ?? r.groups.map(g => target(r.id as EntityId, g)))
    dm.send(on
      ? { t: 'reveal', audience: a, targets }
      : { t: 'conceal', audience: a, targets })
    const who = audiences.find(x => x.id === a)?.name ?? a
    dm.toast(on ? `Everything here shown to ${who}` : `Everything here hidden from ${who}`)
  }

  return (
    <div className="matrix">
      <Find what="anything here" value={q} onChange={setQ}>
        <div className="matrix-head">
          <span>{scene.name}</span>
          <div className="matrix-cols">
            {audiences.map(a => (
              <button key={a.id} className="matrix-col sheen" title={`Reveal everything here to ${a.name}`}
                onClick={() => all(a.id, true)}>{a.name.slice(0, 2)}</button>
            ))}
          </div>
        </div>
      </Find>

      <Hint>
        A filled square means that audience knows it. Columns above set
        everything at once.
      </Hint>

      <div className="matrix-bulk">
        <Action onClick={() => all(TABLE, true)}>show it all to everyone</Action>
        <Action onClick={() => all(TABLE, false)}>hide it all again</Action>
      </div>

      {needle && shown.length === 0 && <NoMatch what="row" />}

      {BINS.map(([bin, title]) => {
        const list = shown.filter(r => r.bin === bin)
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
          <div className="matrix-name">
            <button className="matrix-label sheen" onClick={() => setSelected(row.id)}>
              <span className="matrix-title">{row.label}</span>
              {row.detail && <span className="matrix-detail">{row.detail}</span>}
              {row.says && <span className="matrix-says">{row.says}</span>}
            </button>
            {row.token && (
              <Acts>
                <Action title={`Put a second ${row.token.name} on this map`}
                  onClick={() => copyToken(row.token!)}>duplicate</Action>
                <Action danger title={`Take ${row.token.name} off the table`}
                  onClick={() => dropToken(row.id, row.token!.name)}>remove</Action>
              </Acts>
            )}
          </div>
          {row.groups.map(g => (
            <div key={g} className="matrix-group">
              <span className="matrix-group-name">{groupLabel(g)}</span>
              <div className="matrix-cols">
                {audiences.map(a => {
                  /* A row with an explicit but empty grant has nothing to
                     hand over. `[].every()` is true, so such a square used
                     to render permanently lit and concealing nothing —
                     on, and impossible to turn off. */
                  const ts = row.grant?.length ? row.grant : row.grant ? [] : [target(row.id as EntityId, g)]
                  const on = ts.length > 0 && ts.every(t => has(a.id, t))
                  return (
                    <button key={a.id} className={`cell sheen ${on ? 'is-on' : ''}`}
                      disabled={ts.length === 0}
                      onClick={() => set(a.id, ts, !on)}
                      title={`${groupLabel(g)} \u2192 ${a.name}`} aria-pressed={on} />
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
  ['here', 'Who and what is here'],
  ['text', 'What is written here'],
  ['rolls', 'What a good roll tells them'],
  ['ways', 'Places you can reach from here'],
]

/** The one pseudo-group: a check's targets, granted together. */
const PASS = 'pass'

const LABELS: Record<string, string> = {
  [PASS]: 'on a pass',
  [PRESENCE]: 'on screen', [IDENTITY]: 'who it is', [HEALTH]: 'health',
  reach: 'its reach',
  description: 'description', stage: 'current step', track: 'the track',
}
