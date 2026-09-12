import {
  RESERVED_GROUPS, PRESENCE, IDENTITY, HEALTH, DM_ONLY, TABLE,
  DEFAULT_TOKEN_KINDS, FIXED_GROUPS, MAP_SCALE, REACH, target,
  type CampaignIR, type Scene, type Quest, type Clock, type Actor,
  type EntityId, type SceneId, type AudienceId, type Audience,
  type RevealTarget, type EntityKind, type SymbolEntry, type PlacementDef,
  type TokenKindDef, type EntryDef, type TokenShape, type EntryContent,
  type SceneEntry, type Cue, type QuestStage, type EntryStyle,
  type Check, type Grid, type Item, type StatBlock, type StatRow, type StatSection,
  type SceneLink, type MapKind,
} from './ir.js'

export const SCHEMA_VERSION = 4

export interface Diagnostic {
  path: string
  message: string
  severity: 'error' | 'warning'
}

export type Result<T> =
  | { ok: true; value: T; warnings: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] }

export interface AssetProbe { exists(relPath: string): boolean }

class Ctx {
  diags: Diagnostic[] = []
  err(path: string, message: string) { this.diags.push({ path, message, severity: 'error' }) }
  warn(path: string, message: string) { this.diags.push({ path, message, severity: 'warning' }) }
  get errors() { return this.diags.filter(d => d.severity === 'error') }
  get warnings() { return this.diags.filter(d => d.severity === 'warning') }
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)

function str(c: Ctx, v: unknown, path: string, opts: { default?: string } = {}): string {
  if (v === undefined) {
    if (opts.default !== undefined) return opts.default
    c.err(path, 'required, and missing'); return ''
  }
  if (typeof v !== 'string') { c.err(path, `expected a string, found ${typeof v}`); return '' }
  return v
}

function num(c: Ctx, v: unknown, path: string, lo: number, hi: number, dflt?: number): number {
  if (v === undefined) {
    if (dflt !== undefined) return dflt
    c.err(path, 'required, and missing'); return lo
  }
  if (typeof v !== 'number' || Number.isNaN(v)) {
    c.err(path, `expected a number, found ${typeof v}`); return lo
  }
  if (v < lo || v > hi) {
    c.err(path, `expected a number between ${lo} and ${hi}, found ${v}`)
    return Math.min(hi, Math.max(lo, v))
  }
  return v
}

function arr(c: Ctx, v: unknown, path: string): unknown[] {
  if (v === undefined) return []
  if (!Array.isArray(v)) { c.err(path, `expected an array, found ${typeof v}`); return [] }
  return v
}

function strList(c: Ctx, v: unknown, path: string): string[] {
  return arr(c, v, path).map((x, i) => str(c, x, `${path}/${i}`))
}

function noStrayKeys(c: Ctx, obj: Record<string, unknown>, path: string, known: string[]) {
  for (const k of Object.keys(obj)) {
    if (known.includes(k)) continue
    const near = known.find(x => lev(x, k) <= 2)
    c.err(`${path}/${k}`, near
      ? `unknown field "${k}". Did you mean "${near}"?`
      : `unknown field "${k}"`)
  }
}

function lev(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) =>
    Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
  return d[a.length][b.length]
}

const SHAPES: TokenShape[] = ['disc', 'hex', 'square', 'diamond', 'shield']
const MAP_KINDS: MapKind[] = ['location', 'town', 'region']
const STYLES: EntryStyle[] = ['plain', 'read']

/* ---------------------------- the pass ---------------------------- */

export function validate(raw: unknown, assets: AssetProbe): Result<CampaignIR> {
  const c = new Ctx()

  if (!isObj(raw)) {
    return { ok: false, diagnostics: [{ path: '', message: 'campaign must be a JSON object', severity: 'error' }] }
  }

  noStrayKeys(c, raw, '', [
    'schemaVersion', 'id', 'title', 'lobby', 'difficultyLabel', 'rootScene', 'audiences',
    'tokenKinds', 'actors', 'items', 'scenes', 'quests', 'clocks',
  ])

  const version = num(c, raw.schemaVersion, '/schemaVersion', 0, 1000, 0)
  if (version !== SCHEMA_VERSION) {
    c.err('/schemaVersion',
      `this build reads schema version ${SCHEMA_VERSION}, file declares ${version}. `
      + 'Write a migration rather than accepting both shapes.')
  }

  const id = str(c, raw.id, '/id')
  const title = str(c, raw.title, '/title')

  const symbols = new Map<string, SymbolEntry>()
  const declare = (rawId: string, kind: EntityKind, scene: SceneId | null, path: string, tokenKind?: string) => {
    if (!rawId) return
    if (!/^[a-z0-9][a-z0-9._-]*$/i.test(rawId)) {
      c.err(path, `id "${rawId}" must be alphanumeric with . _ - and start with a letter or digit`)
    }
    if (symbols.has(rawId)) {
      c.err(path, `duplicate id "${rawId}". Ids are unique across the whole campaign.`)
      return
    }
    symbols.set(rawId, { kind, scene, tokenKind })
  }

  /* An actor with no "art" field picks up assets/portraits/<id>.<ext>
     if such a file exists, so filling in art is a matter of naming a
     file rather than editing JSON. */
  const autoArt = (actorId: string): string | null => {
    for (const ext of ART_EXT) {
      const guess = `portraits/${actorId}.${ext}`
      if (assets.exists(guess)) return guess
    }
    return null
  }

  const asset = (v: unknown, path: string): string | null => {
    if (v === undefined) return null
    const rel = str(c, v, path)
    if (rel && !assets.exists(rel)) c.err(path, `asset not found: ${rel}`)
    return rel || null
  }

  /* --- token kinds --- */

  const rawKinds = arr(c, raw.tokenKinds, '/tokenKinds')
  const tokenKinds: TokenKindDef[] = (rawKinds.length > 0 ? rawKinds : DEFAULT_TOKEN_KINDS)
    .map((k, i) => {
      const p = rawKinds.length > 0 ? `/tokenKinds/${i}` : '/tokenKinds'
      if (!isObj(k)) { c.err(p, 'expected an object'); return blankKind() }
      noStrayKeys(c, k, p, ['id', 'label', 'shape', 'accent', 'entries', 'party', 'reach'])
      const kid = str(c, k.id, `${p}/id`)
      const reach = k.reach === undefined || k.reach === null
        ? null : num(c, k.reach, `${p}/reach`, 0, 1000, 5)
      const shape = str(c, k.shape, `${p}/shape`, { default: 'disc' }) as TokenShape
      if (!SHAPES.includes(shape)) c.err(`${p}/shape`, `expected one of ${SHAPES.join(', ')}, found "${shape}"`)

      const seen = new Set<string>()
      const entries: EntryDef[] = arr(c, k.entries, `${p}/entries`).map((e, j) => {
        const ep = `${p}/entries/${j}`
        if (!isObj(e)) { c.err(ep, 'expected an object'); return { id: '', label: '', group: DM_ONLY } }
        noStrayKeys(c, e, ep, ['id', 'label', 'group'])
        const eid = str(c, e.id, `${ep}/id`)
        if (seen.has(eid)) c.err(`${ep}/id`, `duplicate entry "${eid}" on token kind "${kid}"`)
        seen.add(eid)
        const group = str(c, e.group, `${ep}/group`, { default: DM_ONLY })
        if (group === HEALTH || group === PRESENCE) {
          c.err(`${ep}/group`,
            `"${group}" is reserved for the token itself and cannot hold an entry. `
            + `Use "${IDENTITY}", "${DM_ONLY}", or a group name of your own.`)
        }
        return { id: eid, label: str(c, e.label, `${ep}/label`, { default: eid }), group }
      })

      const custom = [...new Set(entries.map(e => e.group))]
        .filter(g => g !== DM_ONLY && !RESERVED_GROUPS.includes(g))

      return {
        id: kid,
        label: str(c, k.label, `${p}/label`, { default: kid }),
        shape, accent: str(c, k.accent, `${p}/accent`, { default: '#8f9bb0' }),
        entries,
        /* A kind that can hit something gains a reach group, so its ring
           is revealed and taken back exactly like its name or its
           health — one more square on the row, no new machinery. */
        groups: [PRESENCE, IDENTITY, HEALTH, ...(reach === null ? [] : [REACH]), ...custom],
        hasSecrets: entries.some(e => e.group === DM_ONLY),
        party: k.party === true,
        reach,
      }
    })

  if (rawKinds.length > 0 && !tokenKinds.some(k => k.party)) {
    c.warn('/tokenKinds',
      'no token kind is marked "party": true, so the DM cannot move the party as a group')
  }

  const kindIds = new Set(tokenKinds.map(k => k.id))
  tokenKinds.forEach((k, i) => {
    if (tokenKinds.filter(x => x.id === k.id).length > 1)
      c.err(`/tokenKinds/${i}/id`, `duplicate token kind "${k.id}"`)
  })

  /* --- audiences --- */

  const audiences: Audience[] = [{ id: TABLE, name: 'Everyone', personal: false, actor: null }]
  const audienceIds = new Set<string>([TABLE])
  arr(c, raw.audiences, '/audiences').forEach((a, i) => {
    const p = `/audiences/${i}`
    if (!isObj(a)) { c.err(p, 'expected an object'); return }
    noStrayKeys(c, a, p, ['id', 'name', 'personal', 'actor'])
    const aid = str(c, a.id, `${p}/id`)
    if (aid === TABLE) { c.warn(`${p}/id`, '"table" is built in and does not need declaring'); return }
    if (audienceIds.has(aid)) { c.err(`${p}/id`, `duplicate audience "${aid}"`); return }
    audienceIds.add(aid)
    audiences.push({
      id: aid as AudienceId,
      name: str(c, a.name, `${p}/name`),
      personal: a.personal === undefined ? true : a.personal === true,
      actor: a.actor === undefined ? null : str(c, a.actor, `${p}/actor`) as Audience['actor'],
    })
  })

  /* --- actors: declared before scenes so placements can resolve --- */

  const rawActors = arr(c, raw.actors, '/actors')
  rawActors.forEach((a, i) => {
    if (isObj(a) && typeof a.id === 'string')
      declare(a.id, 'actor', null, `/actors/${i}/id`,
        typeof a.kind === 'string' ? a.kind : undefined)
  })

  const readEntryMap = (
    v: unknown, path: string, kind: TokenKindDef | null, kindId: string,
  ): Record<string, EntryContent> => {
    const out: Record<string, EntryContent> = {}
    if (v === undefined) return out
    if (!isObj(v)) { c.err(path, 'expected an object keyed by entry id'); return out }
    for (const [key, val] of Object.entries(v)) {
      const kp = `${path}/${key}`
      const def = kind?.entries.find(e => e.id === key)
      if (kind && !def) {
        const near = kind.entries.find(e => lev(e.id, key) <= 2)
        c.err(kp, near
          ? `token kind "${kindId}" has no entry "${key}". Did you mean "${near.id}"?`
          : `token kind "${kindId}" has no entry "${key}". `
            + `Declared: ${kind.entries.map(e => e.id).join(', ') || 'none'}`)
        continue
      }
      if (typeof val === 'string') { out[key] = { text: val, image: null }; continue }
      if (!isObj(val)) { c.err(kp, 'expected a string, or an object with text and/or image'); continue }
      noStrayKeys(c, val, kp, ['text', 'image'])
      const text = val.text === undefined ? null : str(c, val.text, `${kp}/text`)
      const image = asset(val.image, `${kp}/image`)
      if (!text && !image) c.err(kp, 'an entry needs text, an image, or both')
      out[key] = { text, image }
    }
    return out
  }

  const actors: Actor[] = rawActors.map((a, i) => {
    const p = `/actors/${i}`
    if (!isObj(a)) { c.err(p, 'expected an object'); return blankActor() }
    noStrayKeys(c, a, p, ['id', 'kind', 'name', 'art', 'hp', 'entries', 'stats',
      'narration', 'note', 'group', 'hidden', 'reach'])
    const aid = str(c, a.id, `${p}/id`)
    const kindId = str(c, a.kind, `${p}/kind`, { default: 'npc' })
    const kind = tokenKinds.find(k => k.id === kindId) ?? null
    if (!kind) {
      const near = [...kindIds].find(x => lev(x, kindId) <= 2)
      c.err(`${p}/kind`, near
        ? `unknown token kind "${kindId}". Did you mean "${near}"?`
        : `unknown token kind "${kindId}". Declared kinds: ${[...kindIds].join(', ') || 'none'}`)
    }
    return {
      id: aid as Actor['id'],
      kind: kindId,
      name: str(c, a.name, `${p}/name`),
      art: asset(a.art, `${p}/art`) ?? autoArt(aid),
      /* Undefined means "whatever this kind reaches"; a number here is
         the one wolf with a longer bite. */
      reach: a.reach === undefined ? null : num(c, a.reach, `${p}/reach`, 0, 1000, 5),
      maxHp: a.hp === undefined ? null : num(c, a.hp, `${p}/hp`, 1, 100000),
      entries: readEntryMap(a.entries, `${p}/entries`, kind, kindId),
      stats: readStats(c, a.stats, `${p}/stats`),
      narration: strList(c, a.narration, `${p}/narration`),
      note: a.note === undefined ? null : str(c, a.note, `${p}/note`),
      group: str(c, a.group, `${p}/group`, { default: kind?.label ?? 'Other' }),
      hidden: a.hidden === true,
    }
  })

  /* --- items --- */

  const rawItems = arr(c, raw.items, '/items')
  rawItems.forEach((it, i) => {
    if (isObj(it) && typeof it.id === 'string') declare(it.id, 'item', null, `/items/${i}/id`)
  })

  const items: Item[] = rawItems.map((it, i) => {
    const p = `/items/${i}`
    if (!isObj(it)) { c.err(p, 'expected an object'); return blankItem() }
    noStrayKeys(c, it, p, ['id', 'name', 'art', 'text', 'detail', 'secret', 'stats', 'group', 'reveal'])
    return {
      id: str(c, it.id, `${p}/id`) as EntityId,
      name: str(c, it.name, `${p}/name`),
      art: asset(it.art, `${p}/art`),
      text: str(c, it.text, `${p}/text`, { default: '' }),
      detail: str(c, it.detail, `${p}/detail`, { default: '' }),
      secret: str(c, it.secret, `${p}/secret`, { default: '' }),
      stats: readStats(c, it.stats, `${p}/stats`),
      group: str(c, it.group, `${p}/group`, { default: 'Items' }),
    }
  })

  /* --- scenes: declare pass --- */

  const rawScenes = arr(c, raw.scenes, '/scenes')
  if (rawScenes.length === 0) c.err('/scenes', 'a campaign needs at least one scene')

  rawScenes.forEach((s, i) => {
    if (!isObj(s)) return
    const sid = typeof s.id === 'string' ? s.id : ''
    declare(sid, 'scene', sid as SceneId, `/scenes/${i}/id`)
    arr(c, s.entries, `/scenes/${i}/entries`).forEach((e, j) => {
      if (isObj(e) && typeof e.id === 'string')
        declare(e.id, 'entry', sid as SceneId, `/scenes/${i}/entries/${j}/id`)
    })
    arr(c, s.tokens, `/scenes/${i}/tokens`).forEach((t, j) => {
      if (!isObj(t)) return
      // A placement id defaults to `<scene>.<actor>`: unique by construction,
      // still readable in diagnostics, and stable across reloads so a
      // campaign-authored `reveal` keeps referring to the same token.
      const pid = typeof t.id === 'string' ? t.id
        : typeof t.actor === 'string' ? `${sid}.${t.actor}` : ''
      declare(pid, 'placement', sid as SceneId, `/scenes/${i}/tokens/${j}/id`,
        typeof t.actor === 'string'
          ? actors.find(a => a.id === t.actor)?.kind
          : undefined)
    })
  })

  const rawQuests = arr(c, raw.quests, '/quests')
  rawQuests.forEach((q, i) => {
    if (isObj(q) && typeof q.id === 'string') declare(q.id, 'quest', null, `/quests/${i}/id`)
  })
  const rawClocks = arr(c, raw.clocks, '/clocks')
  rawClocks.forEach((k, i) => {
    if (isObj(k) && typeof k.id === 'string') declare(k.id, 'clock', null, `/clocks/${i}/id`)
  })

  /* --- elaborate --- */

  const initialReveals: RevealTarget[] = []
  const readReveal = (v: unknown, path: string, eid: string, known: string[], what: string) => {
    if (v === undefined) return
    if (v === true) { initialReveals.push(target(eid as EntityId)); return }
    arr(c, v, path).forEach((g, i) => {
      if (typeof g !== 'string') { c.err(`${path}/${i}`, 'expected a group name'); return }
      if (g === DM_ONLY) {
        c.err(`${path}/${i}`, 'the "dm" group cannot be revealed; it has no public representation')
        return
      }
      if (!known.includes(g)) {
        c.err(`${path}/${i}`, `"${g}" is not a field group of ${what}. Known groups: ${known.join(', ')}`)
        return
      }
      initialReveals.push(target(eid as EntityId, g))
    })
  }

  const scenes: Scene[] = rawScenes.map((s, i) => {
    const p = `/scenes/${i}`
    if (!isObj(s)) return blankScene()
    noStrayKeys(c, s, p, [
      'id', 'name', 'map', 'background', 'art', 'description', 'entries', 'tokens',
      'cues', 'checks', 'options', 'entry', 'grid', 'pin', 'links', 'prep', 'reveal',
    ])
    const sid = str(c, s.id, `${p}/id`) as SceneId
    const map = str(c, s.map, `${p}/map`, { default: 'location' }) as MapKind
    if (!MAP_KINDS.includes(map)) {
      c.err(`${p}/map`, `expected one of ${MAP_KINDS.join(', ')}, found "${map}"`)
    }
    readReveal(s.reveal, `${p}/reveal`, sid, FIXED_GROUPS.scene, 'a scene')

    const entries: SceneEntry[] = arr(c, s.entries, `${p}/entries`).map((e, j) => {
      const ep = `${p}/entries/${j}`
      if (!isObj(e)) { c.err(ep, 'expected an object'); return blankEntry() }
      noStrayKeys(c, e, ep, ['id', 'label', 'text', 'image', 'style', 'reveal'])
      const eid = str(c, e.id, `${ep}/id`) as EntityId
      readReveal(e.reveal, `${ep}/reveal`, eid, FIXED_GROUPS.entry, 'an entry')
      const text = e.text === undefined ? null : str(c, e.text, `${ep}/text`)
      const image = asset(e.image, `${ep}/image`)
      if (!text && !image) c.err(ep, 'an entry needs text, an image, or both')
      const style = str(c, e.style, `${ep}/style`, { default: 'plain' }) as EntryStyle
      if (!STYLES.includes(style)) c.err(`${ep}/style`, `expected one of ${STYLES.join(', ')}`)
      return {
        id: eid,
        label: e.label === undefined ? null : str(c, e.label, `${ep}/label`),
        text, image, style,
      }
    })

    const placements: PlacementDef[] = arr(c, s.tokens, `${p}/tokens`).map((t, j) => {
      const tp = `${p}/tokens/${j}`
      if (!isObj(t)) { c.err(tp, 'expected an object'); return blankPlacement() }
      noStrayKeys(c, t, tp, ['id', 'actor', 'x', 'y', 'label', 'reveal'])
      const actorId = str(c, t.actor, `${tp}/actor`)
      const actor = actors.find(a => a.id === actorId)
      if (!actor) {
        const near = actors.find(a => lev(a.id, actorId) <= 2)
        c.err(`${tp}/actor`, near
          ? `unresolved actor "${actorId}". Did you mean "${near.id}"?`
          : `unresolved actor "${actorId}"`)
      }
      const pid = (t.id === undefined
        ? `${sid}.${actorId}`
        : str(c, t.id, `${tp}/id`)) as PlacementDef['id']
      const kind = actor ? tokenKinds.find(k => k.id === actor.kind) : null
      readReveal(t.reveal, `${tp}/reveal`, pid, kind?.groups ?? [PRESENCE, IDENTITY],
        `a ${actor?.kind ?? 'token'} placement`)
      return {
        id: pid,
        actor: actorId as PlacementDef['actor'],
        x: num(c, t.x, `${tp}/x`, 0, 1, 0.5),
        y: num(c, t.y, `${tp}/y`, 0, 1, 0.5),
        label: t.label === undefined ? null : str(c, t.label, `${tp}/label`),
      }
    })

    const cues: Cue[] = arr(c, s.cues, `${p}/cues`).map((q, j) => {
      const qp = `${p}/cues/${j}`
      if (typeof q === 'string') return { id: `${sid}.cue.${j}`, when: '', text: q }
      if (!isObj(q)) { c.err(qp, 'expected a string, or an object with when and text'); return { id: '', when: '', text: '' } }
      noStrayKeys(c, q, qp, ['when', 'text'])
      return {
        id: `${sid}.cue.${j}`,
        when: str(c, q.when, `${qp}/when`, { default: '' }),
        text: str(c, q.text, `${qp}/text`),
      }
    })

    const checks: Check[] = arr(c, s.checks, `${p}/checks`).map((k, j) => {
      const kp = `${p}/checks/${j}`
      if (!isObj(k)) { c.err(kp, 'expected an object'); return blankCheck() }
      noStrayKeys(c, k, kp, ['skill', 'dc', 'when', 'success', 'failure', 'reveals'])
      return {
        id: `${sid}.check.${j}`,
        skill: str(c, k.skill, `${kp}/skill`),
        dc: k.dc === undefined ? null : num(c, k.dc, `${kp}/dc`, 0, 1000),
        when: str(c, k.when, `${kp}/when`, { default: '' }),
        success: str(c, k.success, `${kp}/success`, { default: '' }),
        failure: str(c, k.failure, `${kp}/failure`, { default: '' }),
        reveals: strList(c, k.reveals, `${kp}/reveals`),
      }
    })

    const options = strList(c, s.options, `${p}/options`)

    let entry = { x: 0.5, y: 0.72 }
    if (s.entry !== undefined) {
      const ep = `${p}/entry`
      if (!isObj(s.entry)) c.err(ep, 'expected an object with x and y')
      else {
        noStrayKeys(c, s.entry, ep, ['x', 'y'])
        entry = {
          x: num(c, s.entry.x, `${ep}/x`, 0, 1, 0.5),
          y: num(c, s.entry.y, `${ep}/y`, 0, 1, 0.72),
        }
      }
    }

    let grid: Grid | null = null
    if (s.grid !== undefined) {
      const gp = `${p}/grid`
      if (!isObj(s.grid)) c.err(gp, 'expected an object')
      else {
        /* No unit here on purpose: the scene's map kind decides it, so
           two scenes of the same kind cannot disagree about how far a
           square is. */
        noStrayKeys(c, s.grid, gp, ['cols', 'overlay'])
        grid = {
          cols: num(c, s.grid.cols, `${gp}/cols`, 2, 400, 24),
          ...MAP_SCALE[map],
          overlay: s.grid.overlay !== false,
        }
      }
    }

    let pin: Scene['pin'] = null
    if (s.pin !== undefined) {
      const pp = `${p}/pin`
      if (!isObj(s.pin)) c.err(pp, 'expected an object')
      else {
        noStrayKeys(c, s.pin, pp, ['parent', 'x', 'y'])
        pin = {
          parent: str(c, s.pin.parent, `${pp}/parent`) as SceneId,
          x: num(c, s.pin.x, `${pp}/x`, 0, 1, 0.5),
          y: num(c, s.pin.y, `${pp}/y`, 0, 1, 0.5),
        }
      }
    }

    const links: SceneLink[] = arr(c, s.links, `${p}/links`).flatMap((l, i) => {
      const lp = `${p}/links/${i}`
      if (!isObj(l)) { c.err(lp, 'expected an object'); return [] }
      noStrayKeys(c, l, lp, ['scene', 'x', 'y', 'label'])
      return [{
        scene: str(c, l.scene, `${lp}/scene`) as SceneId,
        x: num(c, l.x, `${lp}/x`, 0, 1, 0.5),
        y: num(c, l.y, `${lp}/y`, 0, 1, 0.5),
        // Absent and explicitly null both mean "use the destination's name".
        label: l.label == null ? null : str(c, l.label, `${lp}/label`),
      }]
    })

    let prep: Prep = { want: '', threat: '', wrong: '', notes: '' }
    if (s.prep !== undefined) {
      const pp = `${p}/prep`
      if (!isObj(s.prep)) c.err(pp, 'expected an object')
      else {
        noStrayKeys(c, s.prep, pp, ['want', 'threat', 'wrong', 'notes'])
        prep = {
          want: str(c, s.prep.want, `${pp}/want`, { default: '' }),
          threat: str(c, s.prep.threat, `${pp}/threat`, { default: '' }),
          wrong: str(c, s.prep.wrong, `${pp}/wrong`, { default: '' }),
          notes: str(c, s.prep.notes, `${pp}/notes`, { default: '' }),
        }
        for (const k of ['want', 'threat', 'wrong'] as const)
          if (!prep[k]) c.warn(`${pp}/${k}`, `"${k}" is empty for scene "${sid}"`)
      }
    } else {
      c.warn(p, `scene "${sid}" has no prep block`)
    }

    return {
      id: sid,
      name: str(c, s.name, `${p}/name`),
      map: MAP_KINDS.includes(map) ? map : 'location',
      background: asset(s.background, `${p}/background`),
      art: asset(s.art, `${p}/art`),
      description: str(c, s.description, `${p}/description`, { default: '' }),
      entries, placements, cues, checks, options, entry, grid, pin, links, prep,
    }
  })

  /* --- reference resolution --- */

  scenes.forEach((s, i) => {
    if (!s.pin) return
    const entry = symbols.get(s.pin.parent)
    if (!entry) c.err(`/scenes/${i}/pin/parent`, `unresolved reference "${s.pin.parent}"`)
    else if (entry.kind !== 'scene')
      c.err(`/scenes/${i}/pin/parent`, `"${s.pin.parent}" is a ${entry.kind}, expected a scene`)
    else if (s.pin.parent === s.id)
      c.err(`/scenes/${i}/pin/parent`, 'a scene cannot be pinned to itself')
  })
  detectPinCycles(scenes, c)

  const rootScene = (raw.rootScene as string | undefined) ?? scenes[0]?.id ?? ''
  if (raw.rootScene !== undefined) {
    const entry = symbols.get(rootScene)
    if (!entry || entry.kind !== 'scene') c.err('/rootScene', `unresolved scene reference "${rootScene}"`)
  }

  /* --- quests: stages form a graph --- */

  const quests: Quest[] = rawQuests.map((q, i) => {
    const p = `/quests/${i}`
    if (!isObj(q)) { c.err(p, 'expected an object'); return blankQuest() }
    noStrayKeys(c, q, p, ['id', 'title', 'giver', 'start', 'stages', 'reveal'])
    const qid = str(c, q.id, `${p}/id`) as Quest['id']
    readReveal(q.reveal, `${p}/reveal`, qid, FIXED_GROUPS.quest, 'a quest')

    const stages: QuestStage[] = arr(c, q.stages, `${p}/stages`).map((s, j) => {
      const sp = `${p}/stages/${j}`
      if (!isObj(s)) { c.err(sp, 'expected an object'); return { id: '', playerText: '', dmText: '', options: [] } }
      noStrayKeys(c, s, sp, ['id', 'playerText', 'dmText', 'options'])
      const options = arr(c, s.options, `${sp}/options`).map((o, k) => {
        const op = `${sp}/options/${k}`
        if (!isObj(o)) { c.err(op, 'expected an object'); return { label: '', goto: '' } }
        noStrayKeys(c, o, op, ['label', 'goto'])
        return { label: str(c, o.label, `${op}/label`), goto: str(c, o.goto, `${op}/goto`) }
      })
      return {
        id: str(c, s.id, `${sp}/id`, { default: `stage.${j}` }),
        playerText: str(c, s.playerText, `${sp}/playerText`),
        dmText: str(c, s.dmText, `${sp}/dmText`, { default: '' }),
        options,
      }
    })

    if (stages.length === 0) c.err(`${p}/stages`, 'a quest needs at least one stage')
    const stageIds = new Set(stages.map(s => s.id))
    stages.forEach((s, j) => {
      if (stages.filter(x => x.id === s.id).length > 1)
        c.err(`${p}/stages/${j}/id`, `duplicate stage id "${s.id}" in quest "${qid}"`)
      s.options.forEach((o, k) => {
        if (!stageIds.has(o.goto)) {
          const near = [...stageIds].find(x => lev(x, o.goto) <= 2)
          c.err(`${p}/stages/${j}/options/${k}/goto`, near
            ? `no stage "${o.goto}" in this quest. Did you mean "${near}"?`
            : `no stage "${o.goto}" in this quest. Stages: ${[...stageIds].join(', ')}`)
        }
      })
    })

    // A terminal stage is a legitimate ending. A stage nothing points at,
    // and which is not the start, can never be reached.
    const reachable = new Set<string>()
    const startId = typeof q.start === 'string' ? q.start : stages[0]?.id ?? ''
    const walk = (id: string) => {
      if (reachable.has(id)) return
      reachable.add(id)
      for (const o of stages.find(x => x.id === id)?.options ?? []) walk(o.goto)
    }
    walk(startId)
    stages.forEach((s, j) => {
      if (!reachable.has(s.id))
        c.warn(`${p}/stages/${j}`,
          `stage "${s.id}" is unreachable: nothing branches to it, and it is not the start`)
    })

    const start = str(c, q.start, `${p}/start`, { default: stages[0]?.id ?? '' })
    if (stages.length > 0 && !stageIds.has(start))
      c.err(`${p}/start`, `no stage "${start}" in this quest`)

    return {
      id: qid,
      title: str(c, q.title, `${p}/title`),
      giver: str(c, q.giver, `${p}/giver`, { default: '' }),
      start, stages,
    }
  })

  /* --- clocks --- */

  const clocks: Clock[] = rawClocks.map((k, i) => {
    const p = `/clocks/${i}`
    if (!isObj(k)) { c.err(p, 'expected an object'); return blankClock() }
    noStrayKeys(c, k, p, ['id', 'name', 'caption', 'note', 'max', 'events', 'reveal'])
    const kid = str(c, k.id, `${p}/id`) as Clock['id']
    readReveal(k.reveal, `${p}/reveal`, kid, FIXED_GROUPS.clock, 'a clock')
    const max = num(c, k.max, `${p}/max`, 1, 64, 6)
    const events = arr(c, k.events, `${p}/events`).map((e, j) => {
      const ep = `${p}/events/${j}`
      if (!isObj(e)) { c.err(ep, 'expected an object'); return { at: 1, playerText: '', dmText: '' } }
      noStrayKeys(c, e, ep, ['at', 'playerText', 'dmText'])
      return {
        at: num(c, e.at, `${ep}/at`, 1, max),
        playerText: str(c, e.playerText, `${ep}/playerText`),
        dmText: str(c, e.dmText, `${ep}/dmText`, { default: '' }),
      }
    }).sort((a, b) => a.at - b.at)
    return {
      id: kid,
      name: str(c, k.name, `${p}/name`),
      caption: str(c, k.caption, `${p}/caption`, { default: '' }),
      note: k.note === undefined ? null : str(c, k.note, `${p}/note`),
      max, events,
    }
  })

  /* --- scene links resolve, and may point anywhere including up --- */
  scenes.forEach((sc, i) => {
    sc.links.forEach((l, j) => {
      const path = `/scenes/${i}/links/${j}/scene`
      const sym = symbols.get(l.scene)
      if (!sym) c.err(path, `unresolved scene "${l.scene}"`)
      else if (sym.kind !== 'scene') c.err(path, `"${l.scene}" is a ${sym.kind}, expected a scene`)
      else if (l.scene === sc.id) c.err(path, 'a scene cannot link to itself')
    })
  })

  /* --- audience/actor links resolve against the symbol table --- */
  audiences.forEach(a => {
    if (!a.actor) return
    const i = audiences.indexOf(a) - 1
    const sym = symbols.get(a.actor)
    if (!sym) c.err(`/audiences/${i}/actor`, `unresolved actor "${a.actor}"`)
    else if (sym.kind !== 'actor')
      c.err(`/audiences/${i}/actor`, `"${a.actor}" is a ${sym.kind}, expected an actor`)
    else if (!tokenKinds.find(k => k.id === sym.tokenKind)?.party)
      c.warn(`/audiences/${i}/actor`,
        `"${a.actor}" is not a party-kind actor, so moving it will not move this person's view`)
  })

  /* --- check reveal targets resolve against the symbol table --- */
  scenes.forEach((sc, i) => {
    sc.checks.forEach((k, j) => {
      k.reveals.forEach((t, r) => {
        const [eid, group] = t.split('#')
        const path = `/scenes/${i}/checks/${j}/reveals/${r}`
        const sym = symbols.get(eid)
        if (!sym) { c.err(path, `unresolved reveal target "${eid}"`); return }
        const known = sym.kind === 'placement' || sym.kind === 'actor'
          ? tokenKinds.find(k2 => k2.id === sym.tokenKind)?.groups ?? [PRESENCE, IDENTITY]
          : FIXED_GROUPS[sym.kind as Exclude<EntityKind, 'placement' | 'actor'>]
        const g = group ?? PRESENCE
        if (g === DM_ONLY) {
          c.err(path, 'the "dm" group cannot be revealed; it has no public representation')
        } else if (!known.includes(g)) {
          c.err(path, `"${g}" is not a field group of that ${sym.kind}. Known: ${known.join(', ')}`)
        }
      })
    })
  })

  /* --- unused actor warning: cheap, and catches a real authoring slip --- */
  const placedActors = new Set(scenes.flatMap(s => s.placements.map(p => p.actor as string)))
  actors.forEach((a, i) => {
    if (!placedActors.has(a.id) && a.hidden)
      c.warn(`/actors/${i}`, `actor "${a.id}" is hidden from the roster and never placed, so it is unreachable`)
  })

  if (c.errors.length > 0) return { ok: false, diagnostics: c.diags }

  return {
    ok: true,
    warnings: c.warnings,
    value: {
      schemaVersion: version, id, title,
      lobby: asset(raw.lobby, '/lobby'),
      difficultyLabel: str(c, raw.difficultyLabel, '/difficultyLabel', { default: '' }),
      rootScene: rootScene as SceneId,
      audiences, tokenKinds, actors, items, scenes, quests, clocks, symbols, initialReveals,
    },
  }
}

/** Rows are two-element arrays, so the author controls their order. */
/* Art is optional, and a campaign that has not filled it in yet can
   simply drop files next to the maps: an actor with no "art" field
   picks up assets/portraits/<id>.<ext> if such a file exists. Naming a
   file is the whole interface, and nothing about it is D&D-specific. */
const ART_EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif']

function readRows(c: Ctx, v: unknown, path: string): StatRow[] {
  return arr(c, v, path).flatMap((r, i) => {
    const rp = `${path}/${i}`
    if (!Array.isArray(r) || r.length !== 2) {
      c.err(rp, 'expected a two-element array: ["label", "value"]')
      return []
    }
    return [[str(c, r[0], `${rp}/0`), str(c, r[1], `${rp}/1`)] as StatRow]
  })
}

function readStats(c: Ctx, v: unknown, path: string): StatBlock | null {
  if (v === undefined) return null
  if (!isObj(v)) { c.err(path, 'expected an object'); return null }
  noStrayKeys(c, v, path, ['summary', 'bar', 'abilities', 'meta', 'sections'])

  const sections: StatSection[] = arr(c, v.sections, `${path}/sections`).flatMap((sec, i) => {
    const sp = `${path}/sections/${i}`
    if (!isObj(sec)) { c.err(sp, 'expected an object'); return [] }
    noStrayKeys(c, sec, sp, ['label', 'rows'])
    return [{ label: str(c, sec.label, `${sp}/label`), rows: readRows(c, sec.rows, `${sp}/rows`) }]
  })

  return {
    summary: str(c, v.summary, `${path}/summary`, { default: '' }),
    bar: readRows(c, v.bar, `${path}/bar`),
    abilities: readRows(c, v.abilities, `${path}/abilities`),
    meta: readRows(c, v.meta, `${path}/meta`),
    sections,
  }
}

function detectPinCycles(scenes: Scene[], c: Ctx) {
  const parent = new Map<string, string>()
  for (const s of scenes) if (s.pin) parent.set(s.id, s.pin.parent)
  for (const s of scenes) {
    const seen = new Set<string>([s.id])
    let cur = parent.get(s.id)
    while (cur) {
      if (seen.has(cur)) {
        const i = scenes.findIndex(x => x.id === s.id)
        c.err(`/scenes/${i}/pin/parent`, `pin cycle: ${[...seen, cur].join(' \u2192 ')}`)
        break
      }
      seen.add(cur)
      cur = parent.get(cur)
    }
  }
}

type Prep = Scene['prep']

const blankKind = (): TokenKindDef => ({
  id: '', label: '', shape: 'disc', accent: '#8f9bb0',
  entries: [], groups: [PRESENCE, IDENTITY, HEALTH], hasSecrets: false, party: false, reach: null,
})
const blankActor = (): Actor => ({
  id: '' as Actor['id'], kind: 'npc', name: '', art: null, reach: null, maxHp: null,
  entries: {}, stats: null, narration: [], note: null, group: 'Other', hidden: false,
})
const blankEntry = (): SceneEntry =>
  ({ id: '' as EntityId, label: null, text: null, image: null, style: 'plain' })
const blankPlacement = (): PlacementDef =>
  ({ id: '' as PlacementDef['id'], actor: '' as PlacementDef['actor'], x: 0.5, y: 0.5, label: null })
const blankScene = (): Scene => ({
  id: '' as SceneId, name: '', map: 'location', background: null, art: null, description: '',
  entries: [], placements: [], cues: [], checks: [], options: [],
  entry: { x: 0.5, y: 0.72 }, grid: null, pin: null, links: [],
  prep: { want: '', threat: '', wrong: '', notes: '' },
})
const blankCheck = (): Check =>
  ({ id: '', skill: '', dc: null, when: '', success: '', failure: '', reveals: [] })
const blankItem = (): Item => ({
  id: '' as EntityId, name: '', art: null, text: '', detail: '', secret: '',
  stats: null, group: 'Items',
})
const blankQuest = (): Quest =>
  ({ id: '' as Quest['id'], title: '', giver: '', start: '', stages: [] })
const blankClock = (): Clock =>
  ({ id: '' as Clock['id'], name: '', caption: '', note: null, max: 4, events: [] })

export function formatDiagnostics(diags: Diagnostic[]): string {
  return diags.map(d =>
    `  ${d.severity === 'error' ? 'error' : 'warn '}  ${d.path || '/'}\n         ${d.message}`
  ).join('\n')
}
