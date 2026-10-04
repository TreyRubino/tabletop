import type { CampaignIR, Scene, SceneId, SceneImage } from './ir.js'

/* ------------------------------------------------------------------
   The validator is the only thing that reads untrusted JSON, and it
   is the reason nothing downstream needs a null check: anything that
   comes out of here is an IR with every reference resolved, every
   list present, and every id unique.

   A file that fails never reaches the database and never starts a
   server. Warnings are for things that will run but are probably a
   mistake — a scene with no pictures, an image file that is not on
   disk.
------------------------------------------------------------------ */

export const SCHEMA_VERSION = 5

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

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** An id a human can type and a URL can carry. */
const SLUG = /^[a-z0-9][a-z0-9._-]*$/i

/* ------------------------------------------------------------------
   Authoring shape. Scenes nest as arrays, because that is how a
   person writes a night down; the IR is flat with a `parent`, because
   that is how everything downstream wants to read it. This function
   is the seam between the two.
------------------------------------------------------------------ */

export function validate(raw: unknown, assets: AssetProbe): Result<CampaignIR> {
  const c = new Ctx()

  if (!isObj(raw)) {
    c.err('', 'the campaign file must be a JSON object')
    return { ok: false, diagnostics: c.diags }
  }

  const version = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0
  if (version !== SCHEMA_VERSION) {
    c.err('/schemaVersion',
      `expected ${SCHEMA_VERSION}, found ${raw.schemaVersion ?? 'nothing'}`)
  }

  const id = str(raw.id)
  if (!id) c.err('/id', 'a campaign needs an id')
  else if (!SLUG.test(id)) c.err('/id', `"${id}" is not a usable id: letters, digits, . _ -`)

  const title = str(raw.title)
  if (!title) c.err('/title', 'a campaign needs a title')

  /* ---- scenes ---- */

  const scenes: Scene[] = []
  const seenIds = new Set<string>()

  const walk = (node: unknown, path: string, parent: SceneId | null) => {
    if (!isObj(node)) { c.err(path, 'a scene must be an object'); return }

    const sid = str(node.id)
    if (!sid) c.err(`${path}/id`, 'a scene needs an id')
    else if (!SLUG.test(sid)) c.err(`${path}/id`, `"${sid}" is not a usable id`)
    else if (seenIds.has(sid)) c.err(`${path}/id`, `"${sid}" is used by more than one scene`)
    seenIds.add(sid)

    const name = str(node.name)
    if (!name) c.err(`${path}/name`, 'a scene needs a name')

    /* ---- its pictures ---- */
    const images: SceneImage[] = []
    const rawImages = Array.isArray(node.images) ? node.images : []
    if (!Array.isArray(node.images) && node.images !== undefined) {
      c.err(`${path}/images`, 'images must be a list')
    }
    const seenImages = new Set<string>()
    rawImages.forEach((entry, i) => {
      const ip = `${path}/images/${i}`
      /* A bare string is the common case — one file, no caption — so
         it is allowed and named after its own filename. */
      const obj = typeof entry === 'string' ? { file: entry } : entry
      if (!isObj(obj)) { c.err(ip, 'an image must be a filename or an object'); return }

      const file = str(obj.file)
      if (!file) { c.err(`${ip}/file`, 'an image needs a file'); return }
      if (file.startsWith('/') || file.includes('..')) {
        c.err(`${ip}/file`, 'an image path stays inside the campaign assets directory')
        return
      }
      if (!assets.exists(file)) {
        c.warn(`${ip}/file`, `${file} is not in the campaign's assets directory`)
      }

      const iid = str(obj.id) || `${sid}.${i + 1}`
      if (seenImages.has(iid)) {
        c.err(`${ip}/id`, `"${iid}" is used by more than one image in this scene`)
      }
      seenImages.add(iid)

      images.push({
        id: iid,
        name: str(obj.name) || file.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '),
        file,
      })
    })

    if (images.length === 0) {
      c.warn(`${path}/images`, `"${name || sid}" has no pictures: it will show an empty stage`)
    }

    /* ---- its text ----
       One markdown string, held exactly as written. The validator does
       not parse it, split it or tidy it: the campaign file is the
       record and the inspector is what renders it. */
    const body = typeof node.body === 'string' ? node.body : ''
    if (node.body !== undefined && typeof node.body !== 'string') {
      c.err(`${path}/body`, 'body must be a single markdown string')
    }
    if (!body.trim() && images.length === 0) {
      c.warn(path, `"${name || sid}" has neither words nor pictures`)
    }

    scenes.push({
      id: sid as SceneId,
      name,
      description: str(node.description),
      images,
      body,
      parent,
    })

    /* ---- what is inside it ---- */
    const kids = node.scenes
    if (kids !== undefined && !Array.isArray(kids)) {
      c.err(`${path}/scenes`, 'scenes must be a list')
    } else if (Array.isArray(kids)) {
      kids.forEach((kid, i) => walk(kid, `${path}/scenes/${i}`, sid as SceneId))
    }
  }

  const top = raw.scenes
  if (!Array.isArray(top)) {
    c.err('/scenes', 'a campaign needs a list of scenes')
  } else if (top.length === 0) {
    c.err('/scenes', 'a campaign needs at least one scene')
  } else {
    top.forEach((s, i) => walk(s, `/scenes/${i}`, null))
  }

  /* ---- where it starts ---- */
  let rootScene = str(raw.rootScene)
  if (rootScene && !seenIds.has(rootScene)) {
    c.err('/rootScene', `"${rootScene}" is not a scene in this campaign`)
    rootScene = ''
  }
  if (!rootScene) rootScene = scenes[0]?.id ?? ''

  if (c.errors.length > 0) return { ok: false, diagnostics: c.diags }

  return {
    ok: true,
    warnings: c.warnings,
    value: {
      schemaVersion: SCHEMA_VERSION,
      id, title,
      rootScene: rootScene as SceneId,
      scenes,
    },
  }
}

export function formatDiagnostics(diags: Diagnostic[]): string {
  return diags.map(d =>
    `  ${d.severity === 'error' ? 'error' : 'warn '}  ${d.path || '/'}\n         ${d.message}`
  ).join('\n')
}
