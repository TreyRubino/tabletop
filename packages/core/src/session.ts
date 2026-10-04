import type { CampaignIR, SceneId } from './ir.js'
import { findScene, firstImage } from './ir.js'

/* ------------------------------------------------------------------
   Session state is a fold over a command log. Nothing mutates it
   directly, which is what buys undo, replay and transport agnosticism.

   There are two facts in a session: which scene is up, and which of
   that scene's pictures is up. Everything else about the night lives
   in the campaign file and does not change while you are running it.
------------------------------------------------------------------ */

export interface SessionState {
  /** What every screen is showing. */
  presented: SceneId
  /** The chosen picture per scene, so going back to a scene returns to
      the picture you left it on. Scene id to image id. */
  showing: Record<string, string>
  /** Monotonic, so generated ids never collide after undo. */
  nextId: number
}

export function initialSession(ir: CampaignIR): SessionState {
  const showing: Record<string, string> = {}
  for (const scene of ir.scenes) {
    const first = firstImage(scene)
    if (first) showing[scene.id] = first.id
  }
  return { presented: ir.rootScene, showing, nextId: 1 }
}

/* ---------------------------- commands ---------------------------- */

export type Command =
  /** Put this scene on every screen. */
  | { t: 'present'; scene: SceneId }
  /** Switch which of a scene's pictures is up. */
  | { t: 'show'; scene: SceneId; image: string }

/* ------------------------------------------------------------------
   Total by construction: every command applies to every state. An
   unknown id is ignored rather than throwing, so a replayed log can
   never diverge from the log that produced it.
------------------------------------------------------------------ */

export function apply(ir: CampaignIR, s: SessionState, c: Command): SessionState {
  switch (c.t) {
    case 'present':
      return findScene(ir, c.scene) ? { ...s, presented: c.scene } : s

    case 'show': {
      const scene = findScene(ir, c.scene)
      if (!scene || !scene.images.some(i => i.id === c.image)) return s
      return { ...s, showing: { ...s.showing, [c.scene]: c.image } }
    }
  }
}

export const fold = (ir: CampaignIR, log: Command[]): SessionState =>
  log.reduce((s, c) => apply(ir, s, c), initialSession(ir))

/* ------------------------------------------------------------------
   Everything on screen is everyone's. There are no secrets and no
   per-person state, so there is nothing a player could issue that
   would mean something different coming from them — which is exactly
   why driving the night stays the DM's alone.
------------------------------------------------------------------ */
export const playerMayIssue = (): boolean => false
