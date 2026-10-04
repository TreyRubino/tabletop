import type { ReactNode } from 'react'

/* ------------------------------------------------------------------
   The markdown a campaign was written in, rendered.

   A scene's body is held exactly as it was typed and this is the one
   place that reads it. It handles what the writing actually uses:

     # heading          the conditions and the asides' own titles
     | pipe table |     the check tables
     > blockquote       the DM's own notes
     ---                a break between beats
     **bold**  *italic* a speaker's name, a word leaned on

   Anything else passes through as a paragraph, which is correct: a
   line of prose is a line of prose. There is no parser here worth the
   name and there should not be — pulling in a markdown library to
   render six constructs would cost more than the whole feature.
------------------------------------------------------------------ */

const isTable = (b: string) => b.split('\n').every(l => l.trim().startsWith('|'))
const isQuote = (b: string) => b.split('\n').every(l => l.trim().startsWith('>'))
const isRule = (b: string) => /^(-{3,}|\*{3,}|_{3,})$/.test(b.trim())
/** The rule row under a table's header: |---|---|. */
const isTableRule = (l: string) => /^\|[\s:|-]+\|$/.test(l.trim())

const cells = (row: string) =>
  row.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())

/** **bold** and *italic*, non-nesting, which is all the writing uses. */
function inline(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*/g
  let at = 0
  let m: RegExpExecArray | null
  let i = 0
  while ((m = re.exec(text)) !== null) {
    if (m.index > at) out.push(text.slice(at, m.index))
    out.push(m[1]
      ? <strong key={`${key}-b${i}`}>{m[1]}</strong>
      : <em key={`${key}-i${i}`}>{m[2]}</em>)
    at = m.index + m[0].length
    i++
  }
  if (at < text.length) out.push(text.slice(at))
  return out
}

export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).filter(b => b.trim() !== '')

  return (
    <div className="md">
      {blocks.map((block, bi) => {
        const key = `b${bi}`
        const trimmed = block.trim()

        if (isRule(trimmed)) return <hr key={key} className="md-rule" />

        const h = /^(#{1,6})\s+(.*)$/.exec(trimmed)
        if (h) {
          /* Every heading inside a scene is the same kind of thing —
             the name of the beat that follows it — so they all render
             at one size rather than reproducing a document outline
             inside a panel. */
          return <h3 key={key} className="md-head">{inline(h[2], key)}</h3>
        }

        if (isTable(trimmed)) {
          const rows = trimmed.split('\n').filter(l => !isTableRule(l)).map(cells)
          const [head, ...body] = rows
          return (
            <table key={key} className="md-table">
              <thead>
                <tr>{head.map((c, i) => <th key={i}>{inline(c, `${key}h${i}`)}</th>)}</tr>
              </thead>
              <tbody>
                {body.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((c, i) => <td key={i}>{inline(c, `${key}r${ri}c${i}`)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          )
        }

        if (isQuote(trimmed)) {
          /* The DM's own notes are written as a blockquote holding a
             checklist. The marker is a convention of the file, not
             something to render as a control. */
          const body = trimmed.split('\n')
            .map(l => l.replace(/^\s*>\s?/, '').replace(/^- \[[ x]\]\s*/, ''))
            .join('\n')
          return <p key={key} className="md-aside">{inline(body, key)}</p>
        }

        return <p key={key} className="md-p">{inline(block, key)}</p>
      })}
    </div>
  )
}
