import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadCampaign, reportDiagnostics } from './load.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

// An explicit argument is resolved from wherever the user typed it;
// the default is resolved from the repo root.
const dir = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : resolve(ROOT, process.env.CAMPAIGN ?? 'campaigns/session-two')
const r = loadCampaign(dir)

if (!r.ok) {
  console.error(`\n${r.source}\n`)
  console.error(reportDiagnostics(r.diagnostics))
  console.error(`\n${r.diagnostics.filter(d => d.severity === 'error').length} error(s).\n`)
  process.exit(1)
}

const { ir, warnings } = r.campaign
if (warnings.length > 0) {
  console.warn(`\n${warnings.length} warning(s):`)
  console.warn(reportDiagnostics(warnings))
}
console.log(`\n  ${ir.title} \u2014 ok`)
const pictures = ir.scenes.reduce((n, s) => n + s.images.length, 0)
const words = ir.scenes.reduce((n, s) =>
  n + s.body.split(/\s+/).filter(Boolean).length, 0)
console.log(`  ${ir.scenes.length} scenes, ${pictures} pictures, ${words} words\n`)
