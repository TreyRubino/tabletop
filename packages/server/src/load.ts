import { readFileSync, existsSync, statSync } from 'node:fs'
import { join, resolve, normalize, sep } from 'node:path'
import {
  validate, formatDiagnostics,
  type CampaignIR, type AssetProbe, type Diagnostic,
} from '@tabletop/core'

export interface LoadedCampaign {
  ir: CampaignIR
  root: string
  assetRoot: string
  warnings: Diagnostic[]
}

export type LoadResult =
  | { ok: true; campaign: LoadedCampaign }
  | { ok: false; diagnostics: Diagnostic[]; source: string }

/** Refuses to look outside the campaign's own asset directory. */
function makeProbe(assetRoot: string): AssetProbe {
  return {
    exists(rel: string): boolean {
      if (!rel || rel.includes('\0')) return false
      const abs = resolve(assetRoot, rel)
      if (!abs.startsWith(resolve(assetRoot) + sep)) return false
      return existsSync(abs) && statSync(abs).isFile()
    },
  }
}

/** Reads campaign.json as text, for the store to hash and keep. */
export function readCampaignSource(dir: string): { ok: true; json: string; file: string }
  | { ok: false; diagnostics: Diagnostic[]; source: string } {
  const root = resolve(dir)
  const file = join(root, 'campaign.json')
  if (!existsSync(file)) {
    return { ok: false, source: file,
      diagnostics: [{ path: '', severity: 'error', message: `no campaign.json in ${root}` }] }
  }
  return { ok: true, json: readFileSync(file, 'utf8'), file }
}

/** Validates a source string that already came out of the store. */
export function validateSource(dir: string, json: string): LoadResult {
  const root = resolve(dir)
  const assetRoot = join(root, 'assets')
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, source: join(root, 'campaign.json'),
      diagnostics: [{ path: '', severity: 'error', message: `not valid JSON: ${msg}` }] }
  }
  const result = validate(raw, makeProbe(assetRoot))
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics, source: join(root, 'campaign.json') }
  return { ok: true, campaign: { ir: result.value, root, assetRoot, warnings: result.warnings } }
}

export function loadCampaign(dir: string): LoadResult {
  const root = resolve(dir)
  const file = join(root, 'campaign.json')
  const assetRoot = join(root, 'assets')

  if (!existsSync(file)) {
    return {
      ok: false, source: file,
      diagnostics: [{ path: '', severity: 'error', message: `no campaign.json in ${root}` }],
    }
  }

  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false, source: file,
      diagnostics: [{ path: '', severity: 'error', message: `campaign.json is not valid JSON: ${msg}` }],
    }
  }

  const result = validate(raw, makeProbe(assetRoot))
  if (!result.ok) return { ok: false, diagnostics: result.diagnostics, source: file }

  return {
    ok: true,
    campaign: { ir: result.value, root, assetRoot, warnings: result.warnings },
  }
}

/** Path resolution for asset serving. Same containment rule as the probe. */
export function resolveAsset(assetRoot: string, urlPath: string): string | null {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '')
  if (!rel || rel.includes('\0')) return null
  const abs = resolve(assetRoot, rel)
  if (!abs.startsWith(resolve(assetRoot) + sep)) return null
  if (!existsSync(abs) || !statSync(abs).isFile()) return null
  return abs
}

export const reportDiagnostics = formatDiagnostics
