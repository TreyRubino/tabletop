/* ------------------------------------------------------------------
   The IR.

   A campaign is scenes. A scene is a name, some pictures and some
   text. That is the whole domain: this tool shows a picture on a
   screen and holds the words you read beside it.

   There are no tokens, no actors, no items, no quests, no clocks and
   no reveals. Nothing here is played on — a scene's pictures are
   looked at. Every reference is resolved by the validator, so nothing
   downstream needs a null check.
------------------------------------------------------------------ */

declare const brand: unique symbol
export type Id<K extends string> = string & { readonly [brand]: K }

export type SceneId = Id<'scene'>

/* ---------------------------- scenes ---------------------------- */

/** One picture. A scene has as many as the night needs, in the order
    they are meant to be shown. */
export interface SceneImage {
  id: string
  /** What to call it in the switcher: "the farmhouse", "the standing room". */
  name: string
  /** Path under the campaign's assets directory. */
  file: string
}

export interface Scene {
  id: SceneId
  name: string
  /** One line, shown on the card in the sidebar. */
  description: string
  images: SceneImage[]
  /* Everything written for this scene, as the markdown it was
     authored in. One string, not a list of typed blocks: the campaign
     file is a document, the inspector renders it, and nothing in
     between gets an opinion about which paragraph is which kind. */
  body: string
  /** Scenes nest, so a long night can be grouped. Null at the top. */
  parent: SceneId | null
}

/* ---------------------------- campaign ---------------------------- */

export interface CampaignIR {
  schemaVersion: number
  id: string
  title: string
  /** The scene shown when a session starts, before anyone touches it. */
  rootScene: SceneId
  /** Flat, in author order. Nesting is the `parent` field, not an array. */
  scenes: Scene[]
}

/* ---------------------------- lookups ---------------------------- */

export const findScene = (ir: CampaignIR, id: string): Scene | null =>
  ir.scenes.find(s => s.id === id) ?? null

export const childrenOf = (ir: CampaignIR, id: string): Scene[] =>
  ir.scenes.filter(s => s.parent === id)

/** Root first, this scene last. Used for the breadcrumb trail. */
export function trailTo(ir: CampaignIR, id: string): Scene[] {
  const out: Scene[] = []
  const seen = new Set<string>()
  let at = findScene(ir, id)
  while (at && !seen.has(at.id)) {
    seen.add(at.id)
    out.unshift(at)
    at = at.parent ? findScene(ir, at.parent) : null
  }
  return out
}

/** The picture a scene opens on when nobody has chosen one. */
export const firstImage = (scene: Scene): SceneImage | null => scene.images[0] ?? null
