import { useState, type ReactNode } from 'react'

/* ------------------------------------------------------------------
   A collapsible group that stays how you left it.

   Panels unmount whenever the drawer switches tabs, so component state
   alone forgets everything the moment you look at something else. The
   open/closed set therefore lives outside React, keyed by a stable id,
   and is mirrored into localStorage so it survives a reload too.

   Only *closed* sections are stored. Open is the default, so an empty
   store means everything is open, and a section the campaign gained
   since last time opens rather than hiding itself.
------------------------------------------------------------------ */

const KEY = 'tabletop.collapsed'

const closed: Set<string> = (() => {
  try {
    const raw = localStorage.getItem(KEY)
    return new Set<string>(raw ? JSON.parse(raw) : [])
  } catch {
    return new Set<string>()
  }
})()

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify([...closed])) } catch { /* private mode */ }
}

export function Section({
  id, label, count, tone, children,
}: {
  /** Stable across renders and reloads, e.g. "scene:phandalin". */
  id: string
  label: string
  /** Shown on the right, so a folded group still reports its size. */
  count?: number
  /** 'hidden' marks a group the players cannot see. */
  tone?: 'hidden'
  children: ReactNode
}) {
  const [open, setOpen] = useState(!closed.has(id))

  const toggle = () => {
    const next = !open
    if (next) closed.delete(id)
    else closed.add(id)
    persist()
    setOpen(next)
  }

  return (
    <section className={`sect ${open ? 'is-open' : ''} ${tone === 'hidden' ? 'is-hidden-group' : ''}`}>
      <button className="sect-head" onClick={toggle} aria-expanded={open}>
        <svg className="sect-caret" viewBox="0 0 24 24" width="11" height="11" aria-hidden
          fill="none" stroke="currentColor" strokeWidth="2.6"
          strokeLinecap="round" strokeLinejoin="round">
          <path d="m9 6 6 6-6 6" />
        </svg>
        <h3>{label}</h3>
        {count !== undefined && <span className="sect-count">{count}</span>}
      </button>
      {open && <div className="sect-body">{children}</div>}
    </section>
  )
}
