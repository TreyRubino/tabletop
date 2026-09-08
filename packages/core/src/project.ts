import {
  TABLE, PRESENCE, IDENTITY, HEALTH, DM_ONLY, DETAIL, target,
  findTokenKind, findActor,
  type CampaignIR, type Scene, type Actor, type AudienceId,
  type EntityId, type Viewport, type TokenShape, type Group,
  type EntryStyle, type Grid, type Check, type StatBlock,
} from './ir.js'
import type { SessionState, Placement } from './session.js'

/* ------------------------------------------------------------------
   One world shape, two roles.

   The DM and the players run the same renderer over the same type. The
   difference is what `project` puts in it, not which component reads
   it. Secrets sit in a separate branch of a discriminated union, so
   narrowing to `role: 'player'` yields a type with no secrets field at
   all: a player surface cannot render one because it cannot hold one.

   For players this runs server-side, before serialisation, so the wire
   never carries what a client is not entitled to. For the DM it runs
   client-side over the IR they already have.
------------------------------------------------------------------ */

export interface PublicEntry {
  id: string
  label: string | null
  text: string | null
  image: string | null
  style: EntryStyle
}

export interface PublicToken {
  /** Placement id, not actor id: two goblins are two tokens. */
  id: string
  kind: string
  /** True for the kinds that move together as the party. */
  party: boolean
  /** This viewer plays this character, so they may move this token. */
  mine: boolean
  shape: TokenShape
  accent: string
  x: number
  y: number
  /** Null until identity is revealed: a figure on the map, not a name. */
  name: string | null
  art: string | null
  hp: { current: number; max: number } | null
  entries: PublicEntry[]
}

export interface PublicPin { id: string; name: string; x: number; y: number }

export interface PublicNote {
  id: number
  text: string
  shared: boolean
  seen: boolean
  /** True when this viewer is the one it was addressed to. */
  mine: boolean
}

export interface PublicItem {
  id: string
  name: string
  art: string | null
  text: string
  /** Null until `detail` is revealed. */
  detail: string | null
  group: string
}

export interface PublicScene {
  id: string
  name: string
  background: string | null
  description: string | null
  entries: PublicEntry[]
  tokens: PublicToken[]
  pins: PublicPin[]
  /** Ways out that are not containment: stairs back up, doors across. */
  links: PublicPin[]
  /** Countable squares, so distance is measured rather than argued. */
  grid: Grid | null
  /** Resolved ancestry, root first, for breadcrumbs. Visible scenes only. */
  trail: { id: string; name: string }[]
}

export interface PublicQuest {
  id: string
  title: string
  stageText: string | null
  stageId: string
}

export interface PublicClock {
  id: string
  name: string
  caption: string
  ticks: number | null
  max: number
  latestText: string | null
}

interface WorldBase {
  campaignTitle: string
  scenes: PublicScene[]
  presented: string | null
  viewport: Viewport
  quests: PublicQuest[]
  clocks: PublicClock[]
  items: PublicItem[]
  notes: PublicNote[]
  banner: string | null
}

/* ---- DM-only content, reachable only through the dm branch ---- */

export interface TokenSecret {
  entries: PublicEntry[]
  /** DM-only by construction: no branch of the union reaches a player. */
  stats: StatBlock | null
  note: string | null
  narration: string[]
  groups: Group[]
  actor: string
  actorName: string
}

export interface QuestSecret {
  dmText: string
  options: { label: string; goto: string }[]
  stageCount: number
  /** The whole graph, so a DM can see where a branch goes and jump back. */
  allStages: { id: string; playerText: string }[]
}

export interface Secrets {
  scenePrep: Record<string, { want: string; threat: string; wrong: string; notes: string }>
  sceneCues: Record<string, { id: string; when: string; text: string }[]>
  sceneChecks: Record<string, Check[]>
  sceneOptions: Record<string, string[]>
  tokens: Record<string, TokenSecret>
  quests: Record<string, QuestSecret>
  itemSecrets: Record<string, string>
  clockNow: Record<string, string>
  clockNext: Record<string, string>
}

export type World =
  | (WorldBase & { role: 'player'; audience: string })
  | (WorldBase & { role: 'dm'; audience: 'dm'; secrets: Secrets })

export type PlayerWorld = Extract<World, { role: 'player' }>
export type DMWorld = Extract<World, { role: 'dm' }>

/* ---------------------------- viewers ---------------------------- */

export type Viewer =
  | { role: 'dm' }
  | { role: 'player'; audiences: AudienceId[] }

export const dmViewer = (): Viewer => ({ role: 'dm' })
export const tableViewer = (): Viewer => ({ role: 'player', audiences: [TABLE] })
export const personalViewer = (id: AudienceId): Viewer =>
  ({ role: 'player', audiences: [TABLE, id] })

/** Reveal sets join by union across a viewer's audiences. */
export function revealSet(s: SessionState, v: Viewer): Set<string> {
  if (v.role === 'dm') return new Set()
  const out = new Set<string>()
  for (const a of v.audiences) for (const t of s.reveals[a] ?? []) out.add(t)
  return out
}

/* ---------------------------- projection ---------------------------- */

export function project(ir: CampaignIR, s: SessionState, v: Viewer): World {
  const dm = v.role === 'dm'
  const set = revealSet(s, v)
  const sees = (id: string, group: Group = PRESENCE) =>
    dm || set.has(target(id as EntityId, group))

  const audience: AudienceId = dm ? TABLE : v.audiences[v.audiences.length - 1]
  const pres = s.presented[audience] ?? s.presented[TABLE]

  const visible = ir.scenes.filter(sc => sees(sc.id))
  const visibleIds = new Set<string>(visible.map(sc => sc.id))

  const trailOf = (sc: Scene): { id: string; name: string }[] => {
    const out: { id: string; name: string }[] = []
    let cur: Scene | undefined = sc
    const guard = new Set<string>()
    while (cur && !guard.has(cur.id)) {
      guard.add(cur.id)
      out.unshift({ id: cur.id, name: cur.name })
      const parentId: string | undefined = cur.pin?.parent
      cur = parentId !== undefined && visibleIds.has(parentId)
        ? ir.scenes.find(x => (x.id as string) === parentId)
        : undefined
    }
    return out
  }

  const byScene = new Map<string, [string, Placement][]>()
  for (const [id, p] of Object.entries(s.placements)) {
    if (!byScene.has(p.scene)) byScene.set(p.scene, [])
    byScene.get(p.scene)!.push([id, p])
  }

  const scenes: PublicScene[] = visible.map(sc => ({
    id: sc.id,
    name: sc.name,
    background: sc.background,
    description: sees(sc.id, 'description') ? sc.description : null,
    entries: sc.entries.filter(e => sees(e.id)).map(e => ({
      id: e.id, label: e.label, text: e.text, image: e.image, style: e.style,
    })),
    tokens: (byScene.get(sc.id) ?? []).flatMap(([pid, p]) => {
      const t = projectToken(ir, s, pid, p, sees, dm ? undefined : audience)
      return t ? [t] : []
    }),
    links: sc.links.flatMap(l => {
      if (!visibleIds.has(l.scene)) return []
      const dest = ir.scenes.find(x => x.id === l.scene)
      if (!dest) return []
      const at = s.linkPos[`${sc.id}>${l.scene}`] ?? l
      return [{ id: l.scene, name: l.label ?? dest.name, x: at.x, y: at.y }]
    }),
    pins: ir.scenes.flatMap(child => {
      if (child.pin?.parent !== sc.id || !visibleIds.has(child.id)) return []
      // A DM-corrected position wins over the campaign's guess.
      const at = s.pinPos[child.id] ?? child.pin
      return [{ id: child.id, name: child.name, x: at.x, y: at.y }]
    }),
    grid: sc.grid,
    trail: trailOf(sc),
  }))

  const items: PublicItem[] = ir.items.flatMap(it => {
    if (!sees(it.id)) return []
    return [{
      id: it.id, name: it.name, art: it.art, text: it.text,
      detail: sees(it.id, DETAIL) ? it.detail : null,
      group: it.group,
    }]
  })

  const quests: PublicQuest[] = ir.quests.flatMap(q => {
    if (!sees(q.id)) return []
    const stageId = s.questStage[q.id] ?? q.start
    const stage = q.stages.find(x => x.id === stageId)
    return [{
      id: q.id,
      title: q.title,
      stageText: sees(q.id, 'stage') ? stage?.playerText ?? null : null,
      stageId,
    }]
  })

  const clocks: PublicClock[] = ir.clocks.flatMap(k => {
    if (!sees(k.id)) return []
    const ticks = s.clockTicks[k.id] ?? 0
    const show = sees(k.id, 'track')
    const latest = [...k.events].filter(e => e.at <= ticks).pop()
    return [{
      id: k.id, name: k.name, caption: k.caption,
      ticks: show ? ticks : null, max: k.max,
      latestText: show ? latest?.playerText ?? null : null,
    }]
  })

  const base: WorldBase = {
    campaignTitle: ir.title,
    scenes,
    presented: pres?.scene ?? null,
    viewport: pres?.viewport ?? { x: 0.5, y: 0.5, zoom: 1 },
    quests, clocks, items,
    /* A note reaches its recipient, and everyone else only once the
       recipient chooses to share it. The DM sees all of them. */
    notes: s.notes
      .filter(n => dm || n.shared || n.to === audience)
      .map(n => ({ id: n.id, text: n.text, shared: n.shared, seen: n.seen, mine: n.to === audience })),
    banner: dm ? null : s.banner[audience] ?? s.banner[TABLE] ?? null,
  }

  if (!dm) return { ...base, role: 'player', audience }
  return { ...base, role: 'dm', audience: 'dm', secrets: collectSecrets(ir, s) }
}

function projectToken(
  ir: CampaignIR, s: SessionState, pid: string, p: Placement,
  sees: (id: string, group?: Group) => boolean,
  audience?: string,
): PublicToken | null {
  if (!sees(pid)) return null
  const actor = findActor(ir, p.actor)
  if (!actor) return null

  const kind = findTokenKind(ir, actor.kind)
  const identified = sees(pid, IDENTITY)
  const showHp = sees(pid, HEALTH) && actor.maxHp !== null

  // Entries in the dm group have no branch that reaches PublicToken.
  const entries: PublicEntry[] = (kind?.entries ?? []).flatMap(def => {
    if (def.group === DM_ONLY || !sees(pid, def.group)) return []
    const content = actor.entries[def.id]
    if (!content) return []
    return [{
      id: def.id, label: def.label,
      text: content.text, image: content.image, style: 'plain' as const,
    }]
  })

  return {
    id: pid,
    kind: actor.kind,
    party: kind?.party ?? false,
    mine: !!audience && ir.audiences.find(a => a.id === audience)?.actor === actor.id,
    shape: kind?.shape ?? 'disc',
    accent: kind?.accent ?? '#8f9bb0',
    x: p.x,
    y: p.y,
    name: identified ? p.label ?? actor.name : null,
    art: identified ? actor.art : null,
    hp: showHp ? { current: s.hp[pid] ?? actor.maxHp!, max: actor.maxHp! } : null,
    entries,
  }
}

function collectSecrets(ir: CampaignIR, s: SessionState): Secrets {
  const scenePrep: Secrets['scenePrep'] = {}
  const sceneCues: Secrets['sceneCues'] = {}
  const sceneChecks: Secrets['sceneChecks'] = {}
  const sceneOptions: Secrets['sceneOptions'] = {}
  for (const sc of ir.scenes) {
    scenePrep[sc.id] = sc.prep
    sceneCues[sc.id] = sc.cues
    sceneChecks[sc.id] = sc.checks
    sceneOptions[sc.id] = sc.options
  }

  const itemSecrets: Secrets['itemSecrets'] = {}
  for (const it of ir.items) itemSecrets[it.id] = it.secret

  const tokens: Secrets['tokens'] = {}
  for (const [pid, p] of Object.entries(s.placements)) {
    const actor = findActor(ir, p.actor)
    if (!actor) continue
    const kind = findTokenKind(ir, actor.kind)
    tokens[pid] = {
      stats: actor.stats,
      note: actor.note,
      narration: actor.narration,
      groups: kind?.groups ?? [PRESENCE, IDENTITY],
      actor: actor.id,
      actorName: actor.name,
      entries: (kind?.entries ?? [])
        .filter(def => def.group === DM_ONLY && actor.entries[def.id])
        .map(def => ({
          id: def.id, label: def.label,
          text: actor.entries[def.id].text,
          image: actor.entries[def.id].image,
          style: 'plain' as const,
        })),
    }
  }

  const quests: Secrets['quests'] = {}
  for (const q of ir.quests) {
    const stageId = s.questStage[q.id] ?? q.start
    const stage = q.stages.find(x => x.id === stageId)
    quests[q.id] = {
      dmText: stage?.dmText ?? '',
      options: stage?.options ?? [],
      stageCount: q.stages.length,
      allStages: q.stages.map(x => ({ id: x.id, playerText: x.playerText })),
    }
  }

  const clockNow: Record<string, string> = {}
  const clockNext: Record<string, string> = {}
  for (const k of ir.clocks) {
    const ticks = s.clockTicks[k.id] ?? 0
    clockNow[k.id] = [...k.events].filter(e => e.at <= ticks).pop()?.dmText ?? ''
    clockNext[k.id] = k.events.find(e => e.at === ticks + 1)?.playerText ?? ''
  }

  return {
    scenePrep, sceneCues, sceneChecks, sceneOptions,
    tokens, quests, itemSecrets, clockNow, clockNext,
  }
}

/* ------------------------------------------------------------------
   Full projected snapshot per audience: for a table of five that is a
   few kilobytes and obviously correct. A differ drops in here and
   nowhere else, and it must diff projections, never authoritative
   state, or the diff itself leaks.
------------------------------------------------------------------ */

export type Update = { kind: 'snapshot'; seq: number; world: World }
export const encodeUpdate = (seq: number, world: World): Update =>
  ({ kind: 'snapshot', seq, world })
