import type {
  CampaignIR, SceneId, PlacementId, ActorId, QuestId, ClockId, AudienceId,
  RevealTarget, Viewport, EntityId,
} from './ir.js'
import {
  TABLE, FULL_VIEW, IDENTITY, HEALTH, target,
  findActor, findScene, findTokenKind, partyKinds,
} from './ir.js'

/* ------------------------------------------------------------------
   Session state is a fold over a command log. Nothing mutates it
   directly, which is what buys undo, replay and transport agnosticism.

   Placements live here rather than in the campaign, so the DM can add,
   move, duplicate and remove tokens during play without editing a file.
------------------------------------------------------------------ */

export interface Presentation { scene: SceneId; viewport: Viewport }

export interface Note {
  id: number
  /** The audience it was addressed to. */
  to: string
  text: string
  /** Set by the recipient, not the DM. Shared notes reach everyone. */
  shared: boolean
  /** The recipient has read it; the flag on their screen goes away. */
  seen: boolean
}

export interface Placement {
  actor: string
  scene: string
  x: number
  y: number
  /** Overrides the actor's name. For "Goblin 2" and similar. */
  label: string | null
  /** What this one holds. Overrides the actor's note for the DM. */
  note?: string | null
}

export interface SessionState {
  dmScene: SceneId
  presented: Record<string, Presentation>
  reveals: Record<string, RevealTarget[]>
  placements: Record<string, Placement>
  hp: Record<string, number>
  /** DM-corrected pin positions, overriding the campaign's guesses. */
  pinPos: Record<string, { x: number; y: number }>
  /** The same, for links, keyed "fromScene>toScene". */
  linkPos: Record<string, { x: number; y: number }>
  /** Quest stage ids, not indices: stages form a graph. */
  questStage: Record<string, string>
  /* The stages a quest has actually passed through, in order. A graph
     that branches cannot be read backwards, so the route the table
     took has to be recorded as it is walked or it is lost. Rebuilt
     from the log on every boot, like everything else here. */
  questPath: Record<string, string[]>
  clockTicks: Record<string, number>
  banner: Record<string, string | null>
  /** Private lines. A note is addressed, and its recipient decides whether
      the rest of the table ever hears it. */
  notes: Note[]
  /** Monotonic, so generated ids never collide after undo. */
  nextId: number
}

export function initialSession(ir: CampaignIR): SessionState {
  const placements: Record<string, Placement> = {}
  const hp: Record<string, number> = {}
  for (const scene of ir.scenes) {
    for (const p of scene.placements) {
      placements[p.id] = {
        actor: p.actor, scene: scene.id, x: p.x, y: p.y, label: p.label, note: p.note,
      }
      const actor = findActor(ir, p.actor)
      if (actor?.maxHp != null) hp[p.id] = actor.maxHp
    }
  }
  const questStage: Record<string, string> = {}
  const questPath: Record<string, string[]> = {}
  for (const q of ir.quests) {
    questStage[q.id] = q.start
    questPath[q.id] = [q.start]
  }
  const clockTicks: Record<string, number> = {}
  for (const k of ir.clocks) clockTicks[k.id] = 0

  return {
    dmScene: ir.rootScene,
    // Only the table gets a presentation; personal audiences fall back to it
    // at projection time, so a player's laptop follows unless split off.
    presented: { [TABLE]: { scene: ir.rootScene, viewport: FULL_VIEW } },
    reveals: { [TABLE]: [...ir.initialReveals] },
    placements, hp, pinPos: {}, linkPos: {}, questStage, questPath, clockTicks,
    banner: {},
    notes: [],
    nextId: 1,
  }
}

/* ---------------------------- commands ---------------------------- */

export type Command =
  | { t: 'reveal'; audience: AudienceId; targets: RevealTarget[] }
  | { t: 'conceal'; audience: AudienceId; targets: RevealTarget[] }
  | { t: 'dmScene'; scene: SceneId }
  | { t: 'present'; audience: AudienceId; scene: SceneId; viewport?: Viewport }
  /* Drops a personal override so that audience follows the table again.
     Part of the split-party machinery, with sendToScene. */
  | { t: 'follow'; audience: AudienceId }
  | { t: 'place'; actor: ActorId; scene: SceneId; x: number; y: number; label?: string | null }
  | { t: 'unplace'; placement: PlacementId }
  | { t: 'moveToken'; placement: PlacementId; x: number; y: number }
  | { t: 'sendToScene'; placement: PlacementId; scene: SceneId; x?: number; y?: number }
  | { t: 'movePin'; scene: SceneId; x: number; y: number }
  | { t: 'moveLink'; from: SceneId; to: SceneId; x: number; y: number }
  | { t: 'setHp'; placement: PlacementId; value: number }
  | { t: 'questStage'; quest: QuestId; stage: string }
  | { t: 'clockTicks'; clock: ClockId; ticks: number }
  | { t: 'moveParty'; scene: SceneId }
  | { t: 'note'; audience: AudienceId; text: string }
  /* Issued by the recipient, not the DM. */
  | { t: 'shareNote'; note: number }
  | { t: 'unshareNote'; note: number }
  | { t: 'seeNote'; note: number }
  | { t: 'dropNote'; note: number }
  | { t: 'banner'; audience: AudienceId; text: string | null }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/* ------------------------------------------------------------------
   Total by construction: every command applies to every state. Out of
   range values clamp rather than throw, so a replayed log can never
   diverge from the log that produced it.
------------------------------------------------------------------ */

export function apply(ir: CampaignIR, s: SessionState, c: Command): SessionState {
  switch (c.t) {
    case 'reveal': {
      const cur = new Set(s.reveals[c.audience] ?? [])
      for (const t of c.targets) cur.add(t)
      return { ...s, reveals: { ...s.reveals, [c.audience]: [...cur] } }
    }
    case 'conceal': {
      const drop = new Set(c.targets)
      return {
        ...s,
        reveals: {
          ...s.reveals,
          [c.audience]: (s.reveals[c.audience] ?? []).filter(t => !drop.has(t)),
        },
      }
    }
    case 'dmScene':
      return ir.scenes.some(x => x.id === c.scene) ? { ...s, dmScene: c.scene } : s

    /* Showing somebody a place is how a place gets discovered. Putting
       it on screen while leaving it unrevealed would mean projecting a
       scene the viewer is not allowed to see, so presenting reveals the
       place and its description to that audience as part of the same
       command — and therefore as part of the same undo. */
    case 'present': {
      if (!ir.scenes.some(x => x.id === c.scene)) return s
      const seen = new Set(s.reveals[c.audience] ?? [])
      seen.add(target(c.scene as unknown as EntityId))
      seen.add(target(c.scene as unknown as EntityId, 'description'))
      return {
        ...s,
        reveals: { ...s.reveals, [c.audience]: [...seen] },
        presented: {
          ...s.presented,
          [c.audience]: { scene: c.scene, viewport: c.viewport ?? FULL_VIEW },
        },
      }
    }

    case 'place': {
      const actor = findActor(ir, c.actor)
      if (!actor || !ir.scenes.some(x => x.id === c.scene)) return s
      const id = `plc.${s.nextId}`
      const hp = actor.maxHp != null ? { ...s.hp, [id]: actor.maxHp } : s.hp
      return {
        ...s,
        nextId: s.nextId + 1,
        hp,
        placements: {
          ...s.placements,
          [id]: {
            actor: c.actor, scene: c.scene,
            x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1),
            label: c.label ?? null,
          },
        },
      }
    }

    case 'unplace': {
      if (!s.placements[c.placement]) return s
      const { [c.placement]: _p, ...placements } = s.placements
      const { [c.placement]: _h, ...hp } = s.hp
      // Reveals for a removed placement are dropped too, or a later
      // placement reusing the id would inherit them.
      const reveals: SessionState['reveals'] = {}
      const prefix = `${c.placement}#`
      for (const [aud, list] of Object.entries(s.reveals))
        reveals[aud] = list.filter(t => !t.startsWith(prefix))
      return { ...s, placements, hp, reveals }
    }

    case 'moveToken': {
      const p = s.placements[c.placement]
      if (!p) return s
      return {
        ...s,
        placements: {
          ...s.placements,
          [c.placement]: { ...p, x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1) },
        },
      }
    }

    /* ------------------------------------------------------------------
       Sending one person somewhere carries their screen with them. If an
       audience declares this token's actor as theirs, that audience is
       shown the destination and their view moves to it, while the table
       stays where it was: the machinery a split party actually needs.
    ------------------------------------------------------------------ */
    case 'sendToScene': {
      const p = s.placements[c.placement]
      if (!p || !ir.scenes.some(x => x.id === c.scene)) return s
      const moved = {
        ...s,
        placements: {
          ...s.placements,
          [c.placement]: {
            ...p, scene: c.scene,
            x: clamp(c.x ?? p.x, 0, 1), y: clamp(c.y ?? p.y, 0, 1),
          },
        },
      }
      const actor = findActor(ir, p.actor)
      if (!actor || !findTokenKind(ir, actor.kind)?.party) return moved
      const owner = ir.audiences.find(a => a.actor === actor.id)
      if (!owner) return moved

      const seen = new Set(moved.reveals[owner.id] ?? [])
      seen.add(target(c.scene as unknown as EntityId))
      seen.add(target(c.scene as unknown as EntityId, 'description'))
      seen.add(target(c.placement as unknown as EntityId))
      seen.add(target(c.placement as unknown as EntityId, IDENTITY))
      if (actor.maxHp != null) seen.add(target(c.placement as unknown as EntityId, HEALTH))

      /* Sending somebody where the table already is puts them back with
         the table rather than splitting them off to look at the same
         map through their own window. A personal override that matches
         the table's is not a split, it is a stranded flag: it would
         leave the panel calling them "off on their own", leave rejoin
         lit forever, and stop them following the next time the table
         moves. So going home clears the override instead of setting
         one. */
      const presented = { ...moved.presented }
      if (presented[TABLE]?.scene === c.scene) delete presented[owner.id]
      else {
        const was = s.presented[owner.id] ?? s.presented[TABLE]
        presented[owner.id] = {
          scene: c.scene,
          viewport: was?.scene === c.scene ? was.viewport : FULL_VIEW,
        }
      }

      return { ...moved, reveals: { ...moved.reveals, [owner.id]: [...seen] }, presented }
    }

    case 'movePin': {
      const scene = findScene(ir, c.scene)
      if (!scene?.pin) return s
      return {
        ...s,
        pinPos: { ...s.pinPos, [c.scene]: { x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1) } },
      }
    }

    case 'moveLink': {
      const from = findScene(ir, c.from)
      if (!from?.links.some(l => l.scene === c.to)) return s
      return {
        ...s,
        linkPos: {
          ...s.linkPos,
          [`${c.from}>${c.to}`]: { x: clamp(c.x, 0, 1), y: clamp(c.y, 0, 1) },
        },
      }
    }

    case 'follow': {
      if (c.audience === TABLE) return s
      const presented = { ...s.presented }
      delete presented[c.audience]
      return { ...s, presented }
    }

    case 'setHp': {
      const p = s.placements[c.placement]
      const max = p ? findActor(ir, p.actor)?.maxHp : null
      if (max == null) return s
      return { ...s, hp: { ...s.hp, [c.placement]: clamp(Math.round(c.value), 0, max) } }
    }

    case 'questStage': {
      const q = ir.quests.find(x => x.id === c.quest)
      if (!q || !q.stages.some(st => st.id === c.stage)) return s
      /* Going somewhere new extends the route. Going back to a stage
         already on it is a correction — the table did not walk those
         steps a second time — so the route is cut back to that point
         rather than recording the same stage twice. */
      const was = s.questPath[q.id] ?? [s.questStage[q.id] ?? q.start]
      const back = was.indexOf(c.stage)
      const path = back === -1 ? [...was, c.stage] : was.slice(0, back + 1)
      return {
        ...s,
        questStage: { ...s.questStage, [q.id]: c.stage },
        questPath: { ...s.questPath, [q.id]: path },
      }
    }

    case 'clockTicks': {
      const k = ir.clocks.find(x => x.id === c.clock)
      if (!k) return s
      return { ...s, clockTicks: { ...s.clockTicks, [k.id]: clamp(Math.round(c.ticks), 0, k.max) } }
    }

    /* ------------------------------------------------------------------
       Moving the party IS the scene change: one action lands the tokens,
       shows the destination to everyone, and reveals the party standing
       in it. Baked into the reducer rather than emitted as follow-up
       commands so the log holds one entry and undo reverses all of it.
    ------------------------------------------------------------------ */
    case 'moveParty': {
      const scene = findScene(ir, c.scene)
      if (!scene) return s
      const kinds = new Set(partyKinds(ir))
      const members = Object.entries(s.placements)
        .filter(([, p]) => kinds.has(findActor(ir, p.actor)?.kind ?? ''))
      if (members.length === 0) return s

      const { x: cx, y: cy } = scene.entry
      const r = members.length > 1 ? 0.045 : 0
      const placements = { ...s.placements }
      const shown = new Set(s.reveals[TABLE] ?? [])
      shown.add(target(c.scene as unknown as EntityId))
      shown.add(target(c.scene as unknown as EntityId, 'description'))

      members.forEach(([id, p], i) => {
        const a = (i / members.length) * Math.PI * 2
        placements[id] = {
          ...p, scene: c.scene,
          x: clamp(cx + Math.cos(a) * r, 0.03, 0.97),
          y: clamp(cy + Math.sin(a) * r * 1.4, 0.05, 0.95),
        }
        shown.add(target(id as EntityId))
        shown.add(target(id as EntityId, IDENTITY))
        if (findActor(ir, p.actor)?.maxHp != null) shown.add(target(id as EntityId, HEALTH))
      })

      /* The party moving is the party regrouping. Anyone who had been
         split off with sendToScene holds a personal presented override,
         and leaving it in place would strand their screen on wherever
         they used to be while everybody else moves. So the override is
         dropped for every audience whose character was carried along. */
      /* Moving the party onto the map the table is already looking at is
         not a change of view. Stamping FULL_VIEW there pulled the zoom
         out from under everyone for no reason. Only a genuinely new
         scene resets the window, because a viewport is scene-relative. */
      const at = s.presented[TABLE]
      const presented = {
        ...s.presented,
        [TABLE]: {
          scene: c.scene,
          viewport: at?.scene === c.scene ? at.viewport : FULL_VIEW,
        },
      }
      const carried = new Set(members.map(([, p]) => p.actor as string))
      for (const a of ir.audiences) {
        if (a.actor && carried.has(a.actor)) delete presented[a.id]
      }

      return {
        ...s, placements,
        reveals: { ...s.reveals, [TABLE]: [...shown] },
        presented,
      }
    }

    case 'note': {
      const text = c.text.trim()
      if (!text) return s
      return {
        ...s,
        nextId: s.nextId + 1,
        notes: [...s.notes, { id: s.nextId, to: c.audience, text, shared: false, seen: false }],
      }
    }

    case 'shareNote':
      return { ...s, notes: s.notes.map(n => (n.id === c.note ? { ...n, shared: true, seen: true } : n)) }
    case 'unshareNote':
      return { ...s, notes: s.notes.map(n => (n.id === c.note ? { ...n, shared: false } : n)) }
    case 'seeNote':
      return { ...s, notes: s.notes.map(n => (n.id === c.note ? { ...n, seen: true } : n)) }
    case 'dropNote':
      return { ...s, notes: s.notes.filter(n => n.id !== c.note) }

    case 'banner':
      return { ...s, banner: { ...s.banner, [c.audience]: c.text } }
  }
}

export const fold = (ir: CampaignIR, log: Command[]): SessionState =>
  log.reduce((s, c) => apply(ir, s, c), initialSession(ir))

/* ------------------------------------------------------------------
   The behaviour seam. Triggers, when they exist, subscribe here and
   emit further commands. Stratified on purpose: commands emitted by an
   observer do not themselves fire observers, so this is one level deep
   and total by construction rather than a fixpoint with a step budget.
------------------------------------------------------------------ */

export type Observer =
  (ir: CampaignIR, before: SessionState, after: SessionState, c: Command) => Command[]

export function commit(
  ir: CampaignIR, s: SessionState, c: Command, observers: Observer[],
): { state: SessionState; applied: Command[] } {
  const after = apply(ir, s, c)
  const applied: Command[] = [c]
  let state = after
  for (const obs of observers) {
    for (const emitted of obs(ir, s, after, c)) {
      state = apply(ir, state, emitted)   // no re-entry
      applied.push(emitted)
    }
  }
  return { state, applied }
}

export const isRevealed = (
  s: SessionState, audience: AudienceId, id: string, group = 'presence',
): boolean => (s.reveals[audience] ?? []).includes(target(id as EntityId, group))

/* ------------------------------------------------------------------
   Players hold a small, explicit slice of authority: what to do with
   something they were told privately. Everything else is the DM's.
   The server checks this rather than trusting the client.
------------------------------------------------------------------ */
export function playerMayIssue(
  ir: CampaignIR, s: SessionState, audience: string, c: Command,
): boolean {
  /* What to do with something you were told privately. */
  if (c.t === 'shareNote' || c.t === 'unshareNote' || c.t === 'seeNote' || c.t === 'dropNote') {
    const note = s.notes.find(n => n.id === c.note)
    return !!note && note.to === audience
  }

  /* Where your own feet are. A player may walk their own token around
     the map they are standing on, and nothing else: not another
     character's token, and not onto a different scene. Which map they
     are on remains the DM's to decide, so this cannot be used to travel. */
  if (c.t === 'moveToken') {
    const mine = ir.audiences.find(a => a.id === audience)?.actor
    if (!mine) return false
    const placement = s.placements[c.placement]
    if (!placement || placement.actor !== mine) return false
    const here = s.presented[audience]?.scene ?? s.presented[TABLE]?.scene
    return placement.scene === here
  }

  return false
}

/** Placements on a scene, in stable order. */
export const placementsOn = (s: SessionState, scene: string): [string, Placement][] =>
  Object.entries(s.placements).filter(([, p]) => p.scene === scene)
