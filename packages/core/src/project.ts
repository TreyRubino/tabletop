import { trailTo, firstImage, type CampaignIR } from './ir.js'
import type { SessionState } from './session.js'

/* ------------------------------------------------------------------
   One world shape, two roles.

   The DM and the players run the same renderer over the same type,
   and now over the same content: there is nothing in a scene that one
   may see and the other may not. The role says who may *operate* the
   night, not who may read it, and the server enforces that rather
   than trusting a client.

   Projection survives as the one place that decides what a viewer
   gets. It is thin today. It is where any future "the players cannot
   see this yet" would go, and having a seam costs a function call.
------------------------------------------------------------------ */

export interface PublicImage {
  id: string
  name: string
  /** Path under /assets. Null never happens; images carry a file. */
  file: string
}

export interface PublicScene {
  id: string
  name: string
  description: string
  images: PublicImage[]
  /** The picture currently up for this scene, or null if it has none. */
  showing: PublicImage | null
  /** The scene's markdown, exactly as authored. */
  body: string
  /** Resolved ancestry, root first, for breadcrumbs. */
  trail: { id: string; name: string }[]
}

export interface World {
  role: 'dm' | 'player'
  campaignTitle: string
  scenes: PublicScene[]
  /** The scene on every screen. */
  presented: string
}

/* ------------------------------------------------------------------
   The one thing a player does not get.

   The session document says it in its own first line: the indented
   notes are the DM's alone. They are prep — what the scene is for,
   where it lands, what happens if nobody goes after him — and a
   player reading them ahead of the beat is the whole night spoiled.

   So a blockquote is stripped for players here, server-side, before
   the wire: not hidden in CSS, not skipped in a component, gone. The
   DM's own projection keeps every word.
------------------------------------------------------------------ */
const isAside = (block: string) =>
  block.split('\n').every(l => l.trim().startsWith('>'))

const forPlayers = (body: string): string =>
  body.split(/\n\s*\n/).filter(b => b.trim() !== '' && !isAside(b)).join('\n\n')

export function project(ir: CampaignIR, s: SessionState, role: 'dm' | 'player'): World {
  return {
    role,
    campaignTitle: ir.title,
    presented: s.presented,
    scenes: ir.scenes.map(scene => {
      const chosen = s.showing[scene.id]
      const showing = scene.images.find(i => i.id === chosen) ?? firstImage(scene)
      return {
        id: scene.id,
        name: scene.name,
        description: scene.description,
        images: scene.images.map(i => ({ id: i.id, name: i.name, file: i.file })),
        showing: showing ? { id: showing.id, name: showing.name, file: showing.file } : null,
        body: role === 'dm' ? scene.body : forPlayers(scene.body),
        trail: trailTo(ir, scene.id).map(a => ({ id: a.id, name: a.name })),
      }
    }),
  }
}
