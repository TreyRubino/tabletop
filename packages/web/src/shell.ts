import type { World, Command, PublicScene } from '@tabletop/core'

/* ------------------------------------------------------------------
   One surface, two roles. Everything rendered comes from `world`,
   which has the same shape and the same content for both: there are
   no secrets in this tool and therefore no sidecar to carry them.

   `dm` is the control handle. A player's is null, which is how a
   panel knows whether to draw the controls at all — and the server
   refuses a player's commands regardless, so the null is a courtesy
   to the eye rather than the security boundary.
------------------------------------------------------------------ */

export interface DMControls {
  send: (c: Command) => void
  undo: () => void
  logLength: number
  toast: (text: string) => void
}

export interface ShellState {
  world: World
  dm: DMControls | null
  /** Scene the local viewer is looking at; null means follow the DM. */
  viewing: string | null
  setViewing: (id: string | null) => void
}

export function activeScene(w: World, viewing: string | null): PublicScene | null {
  const id = viewing ?? w.presented
  return w.scenes.find(s => s.id === id) ?? w.scenes[0] ?? null
}
