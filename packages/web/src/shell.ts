import type {
  World, DMWorld, CampaignIR, SessionState, Command, PublicScene,
} from '@tabletop/core'

/* ------------------------------------------------------------------
   One surface, two roles. Everything rendered comes from `world`, which
   has the same shape for a DM and for a player; the DM branch carries a
   secrets sidecar and a control handle.

   Narrowing world to role 'player' yields a type with no `secrets`
   field, so a player render path cannot reach DM content even by
   accident. That is the whole reason the union exists.
------------------------------------------------------------------ */

export interface DMControls {
  ir: CampaignIR
  session: SessionState
  send: (c: Command) => void
  undo: () => void
  logLength: number
  toast: (text: string) => void
}

export interface ShellState {
  world: World
  /** Every surface can send; the server decides what is allowed. */
  send: (c: Command) => void
  dm: DMControls | null
  /** Scene the local viewer is looking at; null means follow the DM. */
  viewing: string | null
  setViewing: (id: string | null) => void
  selected: string | null
  setSelected: (id: string | null) => void
  /* A token, an item, a quest and a clock are four answers to one
     question — what is the sidebar describing — so the setters are
     mutually exclusive: choosing any clears the rest. */
  selectedItem: string | null
  setSelectedItem: (id: string | null) => void
  selectedQuest: string | null
  setSelectedQuest: (id: string | null) => void
  selectedClock: string | null
  setSelectedClock: (id: string | null) => void
  /** The token the inspector is describing, which is not always the
      token your hand is on: clicking the map picks up without reading. */
  readToken: string | null
  /** Actor armed for placement: the next map click drops it. DM only. */
  arming: string | null
  setArming: (actorId: string | null) => void
}

export const isDM = (w: World): w is DMWorld => w.role === 'dm'

export function activeScene(w: World, viewing: string | null): PublicScene | null {
  const id = viewing ?? w.presented
  return w.scenes.find(s => s.id === id) ?? w.scenes[0] ?? null
}
