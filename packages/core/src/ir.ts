/* ------------------------------------------------------------------
   The IR. Every reference is resolved by the validator, so nothing
   downstream needs a null check.

   v3 separates an *actor* (a definition: this is what a bugbear is)
   from a *placement* (an instance: this bugbear, on this map, here).
   Actors live in the campaign and never move. Placements live in
   session state, so the DM can add, move, duplicate and remove them
   during play without touching the campaign file.
------------------------------------------------------------------ */

declare const brand: unique symbol
export type Id<K extends string> = string & { readonly [brand]: K }

export type EntityId = Id<'entity'>
export type SceneId = Id<'entity'>
export type ActorId = Id<'entity'>
/** Instance id. Reveals target placements, not actors: two goblins hide separately. */
export type PlacementId = Id<'entity'>
export type QuestId = Id<'entity'>
export type ClockId = Id<'entity'>
export type AudienceId = Id<'audience'>

export const TABLE = 'table' as AudienceId

export type Group = string

/** Reserved groups. */
export const PRESENCE = 'presence'
export const IDENTITY = 'identity'
export const HEALTH = 'health'
/** A sink: content here has no public representation and never will. */
export const DM_ONLY = 'dm'
/** A ring showing how far a creature can hit. Revealed like anything else. */
export const REACH = 'reach'
export const RESERVED_GROUPS = [PRESENCE, IDENTITY, HEALTH, REACH, DM_ONLY]

export type RevealTarget = string
export const target = (id: EntityId | PlacementId, group: Group = PRESENCE): RevealTarget =>
  `${id}#${group}`

export interface Audience {
  id: AudienceId
  name: string
  personal: boolean
  /** The party actor this person plays. Moving that token moves their view. */
  actor: ActorId | null
}

export interface Viewport { x: number; y: number; zoom: number }
export const FULL_VIEW: Viewport = { x: 0.5, y: 0.5, zoom: 1 }

/* ---------------------------- token kinds ---------------------------- */

export type TokenShape = 'disc' | 'hex' | 'square' | 'diamond' | 'shield'

export interface EntryDef {
  id: string
  label: string
  /** Reveal group controlling it. `dm` means never projectable. */
  group: Group
}

export interface TokenKindDef {
  id: string
  label: string
  shape: TokenShape
  accent: string
  entries: EntryDef[]
  /** presence, identity, health, plus every non-dm group its entries use. */
  groups: Group[]
  hasSecrets: boolean
  /** Placements of this kind move together when the DM moves the party. */
  party: boolean
  /** How far this kind can hit, in feet. Null draws no ring. */
  reach: number | null
}

/* ---------------------------- actors ---------------------------- */

export interface EntryContent { text: string | null; image: string | null }

/* ------------------------------------------------------------------
   A stat block the DM can run from without opening a book. Ordered
   label/value rows in named sections, which is generic enough for any
   system: the engine never interprets a row, it only lays it out.
------------------------------------------------------------------ */
export type StatRow = [label: string, value: string]

export interface StatSection {
  label: string
  rows: StatRow[]
}

export interface StatBlock {
  /** "Large monstrosity, unaligned" */
  summary: string
  /** The defensive line: AC, HP, Speed. */
  bar: StatRow[]
  /** STR through CHA, or whatever the system uses. */
  abilities: StatRow[]
  /** Saves, skills, senses, languages, challenge. */
  meta: StatRow[]
  /** Traits, Actions, Reactions, Legendary Actions, Lair Actions. */
  sections: StatSection[]
}

/* ------------------------------------------------------------------
   A way out. `pin` says which map contains which, and so must stay a
   tree: the validator rejects cycles in it. A link says nothing about
   containment, only "there is a way to there, and it is here on this
   map", which is why a link may point at an ancestor. The stair down
   from the manor is a pin; the stair back up is a link.
------------------------------------------------------------------ */
export interface SceneLink {
  scene: SceneId
  x: number
  y: number
  /** Defaults to the target scene's name. */
  label: string | null
}

export interface Actor {
  id: ActorId
  kind: string
  name: string
  art: string | null
  /** Overrides the kind's reach for this one creature. */
  reach: number | null
  maxHp: number | null
  entries: Record<string, EntryContent>
  /** DM-only, and never projectable. */
  stats: StatBlock | null
  /** DM-only lines to read aloud when this thing acts. Cycled in the inspector. */
  narration: string[]
  note: string | null
  /** Roster section, e.g. "Party", "Phandalin", "Bestiary". */
  group: string
  /** Hidden from the roster; used for one-off scenery. */
  hidden: boolean
}

/* ---------------------------- scenes ---------------------------- */

/** An authored starting placement. Session state owns it from load onward. */
export interface PlacementDef {
  id: PlacementId
  actor: ActorId
  x: number
  y: number
  label: string | null
}

export type EntryStyle = 'plain' | 'read'

export interface SceneEntry {
  id: EntityId
  label: string | null
  text: string | null
  image: string | null
  /** `read` marks boxed text meant to be read aloud. */
  style: EntryStyle
}

/** DM-only prompts: sensory detail, what happens if, how an NPC sounds. */
export interface Cue {
  id: string
  when: string
  text: string
}

/* ------------------------------------------------------------------
   A check is the unit the DM actually needs mid-scene: what a player
   can roll, against what, and what each outcome opens up. `reveals`
   fires at whatever audience the DM picks, which is how one character
   learns something the rest of the table does not.
------------------------------------------------------------------ */
export interface Check {
  id: string
  skill: string
  dc: number | null
  when: string
  success: string
  failure: string
  /** Reveal targets granted on a pass. Resolved by the validator. */
  reveals: RevealTarget[]
}

/* ------------------------------------------------------------------
   A map's scale. `cols` is how many cells span the image's width and
   may be fractional, because a real map's edge rarely lands on a cell
   boundary. `overlay` draws the square grid; a map with its own printed
   hexes sets it false and keeps only the scale bar and the ruler, both
   calibrated to the same cell.
------------------------------------------------------------------ */
/* ------------------------------------------------------------------
   How big a cell is follows from what kind of map it is, rather than
   being typed out per scene. Three values, so it cannot drift: a room
   is paced in feet, a town in yards, a coastline in miles. Hand-writing
   the unit is what left Phandalin claiming a hundred feet a square.
------------------------------------------------------------------ */

export type MapKind = 'location' | 'town' | 'region'

export const MAP_SCALE: Record<MapKind, { unit: number; label: string }> = {
  location: { unit: 5, label: 'ft' },
  town: { unit: 5, label: 'yd' },
  region: { unit: 5, label: 'mi' },
}

/** Feet in one of each label, so a reach in feet can be drawn on any of them. */
const FEET: Record<string, number> = { ft: 1, yd: 3, mi: 5280 }


export interface Grid {
  cols: number
  /** Real-world size of one cell, derived from the scene's map kind. */
  unit: number
  label: string
  overlay: boolean
}

/** How many cells across a distance in feet reaches on this grid. */
export const cellsForFeet = (grid: Grid, feet: number): number =>
  feet / (grid.unit * (FEET[grid.label] ?? 1))

export interface Pin { parent: SceneId; x: number; y: number }

export interface Prep { want: string; threat: string; wrong: string; notes: string }

export interface Scene {
  id: SceneId
  name: string
  /** A room, a settlement, or a stretch of country. Sets the grid scale. */
  map: MapKind
  /** The map the table plays on. */
  background: string | null
  /** A picture of the place, for the sidebar. Not the map: the map is
      played on, this is looked at, and a battle grid makes a poor
      illustration of somewhere you have only heard about. */
  art: string | null
  description: string
  entries: SceneEntry[]
  placements: PlacementDef[]
  cues: Cue[]
  checks: Check[]
  /** DM-only: what the players can actually do here, in plain language. */
  options: string[]
  /** Where the party lands when moved here as a group. */
  entry: { x: number; y: number }
  grid: Grid | null
  pin: Pin | null
  /** One-way markers to anywhere, including back the way they came. */
  links: SceneLink[]
  prep: Prep
}

/* ------------------------------------------------------------------
   Items are entities, not inventory. Granting one is a reveal, so the
   same audience machinery decides who has it and who merely knows it
   exists. There is no weight, no slots and no economy: this shows and
   hides things, and the sheet lives somewhere else.
------------------------------------------------------------------ */
export interface Item {
  id: EntityId
  name: string
  art: string | null
  /** Shown once presence is revealed. */
  text: string
  /** Shown once `detail` is revealed. */
  detail: string
  /** Never projectable. */
  secret: string
  /** What it does, in the same shape a creature's block uses. Travels
      with the item, so whoever holds it can read it. */
  stats: StatBlock | null
  group: string
}

/* ---------------------------- threads ---------------------------- */

/** Stages form a graph, not a line: `options` are the branches out. */
export interface QuestStage {
  id: string
  playerText: string
  dmText: string
  options: { label: string; goto: string }[]
}

export interface Quest {
  id: QuestId
  title: string
  giver: string
  start: string
  stages: QuestStage[]
}

export interface ClockEvent { at: number; playerText: string; dmText: string }

export interface Clock {
  id: ClockId
  name: string
  /** One line under the name, and the players read it too. */
  caption: string
  /** DM-only, like an actor's note. Staging, not description. */
  note: string | null
  max: number
  events: ClockEvent[]
}

/* ---------------------------- campaign ---------------------------- */

export type EntityKind =
  'scene' | 'placement' | 'entry' | 'quest' | 'clock' | 'actor' | 'item'

export interface SymbolEntry {
  kind: EntityKind
  scene: SceneId | null
  tokenKind?: string
}

export interface CampaignIR {
  schemaVersion: number
  id: string
  title: string
  /** Art behind the screen a player sees while choosing who they are.
      Campaign data: null just means a plain join page. */
  lobby: string | null
  /** What this system calls a check's target number: "DC", "TN", "".
      Empty renders the number alone, which is the neutral default. */
  difficultyLabel: string
  rootScene: SceneId
  audiences: Audience[]
  tokenKinds: TokenKindDef[]
  actors: Actor[]
  items: Item[]
  scenes: Scene[]
  quests: Quest[]
  clocks: Clock[]
  symbols: Map<string, SymbolEntry>
  initialReveals: RevealTarget[]
}

/* ---------------------------- lookups ---------------------------- */

export const DETAIL = 'detail'

export const FIXED_GROUPS: Record<Exclude<EntityKind, 'placement' | 'actor'>, Group[]> = {
  scene: [PRESENCE, 'description'],
  entry: [PRESENCE],
  quest: [PRESENCE, 'stage'],
  clock: [PRESENCE, 'track'],
  item: [PRESENCE, DETAIL],
}

export function groupsFor(ir: CampaignIR, kind: EntityKind, tokenKind?: string): Group[] {
  if (kind === 'placement' || kind === 'actor') {
    return ir.tokenKinds.find(k => k.id === tokenKind)?.groups ?? [PRESENCE, IDENTITY]
  }
  return FIXED_GROUPS[kind]
}

export const findTokenKind = (ir: CampaignIR, id: string): TokenKindDef | null =>
  ir.tokenKinds.find(k => k.id === id) ?? null

export const findActor = (ir: CampaignIR, id: string): Actor | null =>
  ir.actors.find(a => a.id === id) ?? null

export const findScene = (ir: CampaignIR, id: string): Scene | null =>
  ir.scenes.find(s => s.id === id) ?? null

export const findItem = (ir: CampaignIR, id: string): Item | null =>
  ir.items.find(i => i.id === id) ?? null

/** Token kinds the campaign marked as moving with the party. */
export const partyKinds = (ir: CampaignIR): string[] =>
  ir.tokenKinds.filter(k => k.party).map(k => k.id)

export const DEFAULT_TOKEN_KINDS: {
  id: string; label: string; shape: TokenShape; accent: string
  party?: boolean; reach?: number
}[] = [
  { id: 'pc', label: 'Player character', shape: 'shield', accent: '#64a9c9', party: true, reach: 5 },
  { id: 'npc', label: 'Person', shape: 'disc', accent: '#8f9bb0', reach: 5 },
  { id: 'monster', label: 'Monster', shape: 'hex', accent: '#a2544c', reach: 5 },
  { id: 'object', label: 'Thing', shape: 'square', accent: '#8a8272' },
]
