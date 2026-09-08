#!/usr/bin/env node
/* ------------------------------------------------------------------
   Portraits, in two commands.

     npm run portraits:manifest -- campaigns/icespire
     npm run portraits:fetch    -- campaigns/icespire

   The first walks the campaign and writes assets/portraits/sources.json
   listing every actor and item that has no art yet, each with a blank
   url and a suggested search term. Fill in the urls you want. The
   second downloads them to the filename the app already looks for, so
   nothing in campaign.json has to change.

   Nothing here knows what D&D is. It reads whatever actors and items
   the campaign declares, which is the whole point.
------------------------------------------------------------------ */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [mode, dirArg] = process.argv.slice(2)
const dir = resolve(dirArg ?? 'campaigns/icespire')
const campaignFile = join(dir, 'campaign.json')
const portraitDir = join(dir, 'assets', 'portraits')
const sourcesFile = join(portraitDir, 'sources.json')

if (!existsSync(campaignFile)) {
  console.error(`no campaign.json in ${dir}`)
  process.exit(1)
}
const campaign = JSON.parse(readFileSync(campaignFile, 'utf8'))

const EXT = ['jpg', 'jpeg', 'png', 'webp', 'avif']
const alreadyHas = id => EXT.some(e => existsSync(join(portraitDir, `${id}.${e}`)))

/* ---------------------------------------------------------------- manifest */

function manifest() {
  mkdirSync(portraitDir, { recursive: true })

  const kindOf = id => campaign.tokenKinds?.find(k => k.id === id)?.label ?? id
  const entries = []

  for (const a of campaign.actors ?? []) {
    if (a.art || alreadyHas(a.id)) continue
    entries.push({
      id: a.id,
      name: a.name,
      what: kindOf(a.kind),
      // A starting point for a search, built from what the campaign says.
      hint: `${a.name} ${kindOf(a.kind).toLowerCase()} fantasy art`,
      url: '',
    })
  }
  for (const it of campaign.items ?? []) {
    if (it.art || alreadyHas(it.id)) continue
    entries.push({
      id: it.id, name: it.name, what: it.group ?? 'Item',
      hint: `${it.name} fantasy item art`, url: '',
    })
  }

  const existing = existsSync(sourcesFile)
    ? JSON.parse(readFileSync(sourcesFile, 'utf8'))
    : { note: '', entries: [] }
  const keep = new Map((existing.entries ?? []).map(e => [e.id, e.url]))
  for (const e of entries) if (keep.get(e.id)) e.url = keep.get(e.id)

  writeFileSync(sourcesFile, JSON.stringify({
    note: 'Fill in "url" for anything you want art for, then run '
        + 'npm run portraits:fetch. Existing urls are preserved when '
        + 'you regenerate. You are choosing the sources, so you are '
        + 'choosing the licence: prefer public domain or CC0.',
    entries,
  }, null, 2) + '\n')

  console.log(`${entries.length} without art -> ${sourcesFile}`)
  console.log(`${(entries.filter(e => e.url).length)} already have a url filled in`)
}

/* ---------------------------------------------------------------- fetch */

const TYPES = {
  'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/avif': 'avif',
}

async function fetchAll() {
  if (!existsSync(sourcesFile)) {
    console.error(`no ${sourcesFile}. Run the manifest command first.`)
    process.exit(1)
  }
  const { entries } = JSON.parse(readFileSync(sourcesFile, 'utf8'))
  const wanted = entries.filter(e => e.url)
  if (wanted.length === 0) {
    console.log('No urls filled in yet. Nothing to do.')
    return
  }
  mkdirSync(portraitDir, { recursive: true })

  let ok = 0, failed = 0
  for (const e of wanted) {
    if (alreadyHas(e.id)) { console.log(`  skip  ${e.id} (already has a file)`); continue }
    try {
      const res = await fetch(e.url, { redirect: 'follow' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const type = (res.headers.get('content-type') ?? '').split(';')[0].trim()
      const ext = TYPES[type]
      if (!ext) throw new Error(`not an image (${type || 'unknown type'})`)
      const buf = Buffer.from(await res.arrayBuffer())
      writeFileSync(join(portraitDir, `${e.id}.${ext}`), buf)
      const mb = buf.length / 1e6
      console.log(`  ok    ${e.id}.${ext}  ${mb.toFixed(2)} MB`)
      if (mb > 2) console.log('        large \u2014 consider downscaling to about 900px')
      ok++
    } catch (err) {
      console.log(`  FAIL  ${e.id}: ${err.message}`)
      failed++
    }
  }
  console.log(`\n${ok} fetched, ${failed} failed. Restart the server to pick them up.`)
}

if (mode === 'manifest') manifest()
else if (mode === 'fetch') await fetchAll()
else {
  console.error('usage: portraits.mjs <manifest|fetch> [campaignDir]')
  process.exit(1)
}
