import { useEffect, useRef, type ReactNode } from 'react'

/* ------------------------------------------------------------------
   The kit. Nine templates, and every panel is assembled from them.

   The rule is that no panel builds a box, a button, a menu, a search
   field, a hint or an empty state of its own. If something here does
   not fit, the template changes and every panel changes with it —
   which is the entire point, because the alternative is seven panels
   that each grew their own idea of what a card is.

     Card    one entity, one box, always the same slots
     Acts    a row of controls
     Action  a button
     Chip    a small on/off button
     Sticky  a panel header that stays put while the panel scrolls
     Find    a sticky search field, built on Sticky
     Field   somewhere to type: one line, or several
     Hint    a line of guidance
     Empty   nothing here yet, said in one voice

   Section lives next door and is re-exported here, so a panel imports
   from one place.
------------------------------------------------------------------ */

export { Section } from './Section'

/* ---------------------------- the shimmer ----------------------------
   Every highlight in the app is `sheen`, which is a breadcrumb's hover
   generalised: a quiet fill under the pointer, and the same fill in
   accent with a hairline ring when the thing is chosen. Applied here so
   a panel cannot invent a sixth one.
------------------------------------------------------------------ */

const sheen = (on?: boolean) => `sheen${on ? ' is-on' : ''}`

/* ---------------------------- Card ----------------------------
   One entity, one box. A person, an item, a note, a place and a
   roster entry are all this, with the same type at the same sizes in
   the same order, so two panels cannot drift apart by describing the
   same kind of thing differently.

   The slots are fixed and every card fills the ones its entity has:

     title   its name
     tag     a short status, amber when it means players cannot see it
     meta    one line of context — where it is, who holds it
     body    its prose
     acts    what you can do to it

   `meta` has no empty case on purpose. A card that cannot say where
   its subject is says so in words rather than dropping the line and
   standing a quarter-inch shorter than the card above it.

   There is deliberately no slot for the DM's hidden line. The left
   side is where you operate on a thing; what is written about it,
   including everything the players cannot see, belongs in the
   inspector on the right. A card that carried both would be two
   panels wearing one border.
------------------------------------------------------------------ */

export function Card({
  title, tag, tagTone, meta, body, acts,
  hidden, active, onOpen, openTitle, children,
}: {
  title: ReactNode
  /** A short status word, right of the name. */
  tag?: ReactNode
  /** 'hidden' is amber: the players cannot see this. 'live' is accent:
      it is on their screens right now. */
  tagTone?: 'hidden' | 'live'
  /** One line of context. Required — say "nowhere" rather than omit it. */
  meta: ReactNode
  body?: ReactNode
  acts?: ReactNode
  /** Dims the whole card: nobody can see this yet. */
  hidden?: boolean
  /** The card is the one currently open in the inspector. */
  active?: boolean
  onOpen?: () => void
  openTitle?: string
  children?: ReactNode
}) {
  /* Opening a panel should land on whatever is already chosen rather
     than at the top of a list the chosen thing may be nowhere near.
     Every card in the app is this component, so saying it once here
     covers the whole sidebar. `nearest` means a card already in view
     does not move, so this never fights a scroll in progress. */
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    if (active) box.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const open = onOpen
    ? {
      onClick: onOpen,
      role: 'button',
      tabIndex: 0,
      title: openTitle,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen() }
      },
    }
    : {}

  return (
    <article ref={box}
      className={[
        'card', sheen(active), hidden ? 'is-hidden' : '', onOpen ? 'is-openable' : '',
      ].filter(Boolean).join(' ')}
      {...open}>
      <div className="card-top">
        <div className="card-id">
          <h4 className="card-title">{title}</h4>
          <p className="card-meta">{meta}</p>
        </div>
        {tag && <span className={`card-tag${tagTone ? ` is-${tagTone}-tag` : ''}`}>{tag}</span>}
      </div>
      {body && <p className="prose">{body}</p>}
      {children}
      {acts && <Acts>{acts}</Acts>}
    </article>
  )
}

export const initials = (name: string) =>
  name.replace(/^(The|A|An)\s+/i, '').split(/\s+/).map(w => w[0] ?? '').join('').slice(0, 2).toUpperCase()

/* ---------------------------- Acts ----------------------------
   A row of controls. Wraps, stays on the baseline, never grows a
   bespoke gap of its own.
------------------------------------------------------------------ */

export function Acts({ children }: { children: ReactNode }) {
  return <div className="card-acts">{children}</div>
}

/* ---------------------------- Action ----------------------------
   The button. There is one shape. `danger` for the act that destroys
   something and `on` for a state you can see are colour, not a second
   button — a filled call-to-action would be a third kind of thing on a
   panel where every card carries three or four of these.
------------------------------------------------------------------ */

export function Action({
  children, onClick, disabled, title, on, danger, end, stop = true,
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  title?: string
  on?: boolean
  danger?: boolean
  /** Pushed to the far end of its row, away from the acts beside it. */
  end?: boolean
  /** Cards open on click, so controls inside one stop the event. */
  stop?: boolean
}) {
  return (
    <button
      className={['act', sheen(on), danger ? 'is-danger' : '', end ? 'is-end' : '']
        .filter(Boolean).join(' ')}
      disabled={disabled} title={title}
      onClick={e => { if (stop) e.stopPropagation(); onClick?.() }}>
      {children}
    </button>
  )
}

/* ---------------------------- Chip ----------------------------
   A small button that is either on or off and says which. Used for
   audiences: who has this item, who is this note for.
------------------------------------------------------------------ */

export function Chip({
  children, on, locked, onClick, title,
}: {
  children: ReactNode
  on?: boolean
  /** Shown as fixed rather than clickable: amber, no pointer. */
  locked?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <button className={['chip', sheen(on), locked ? 'is-locked' : ''].filter(Boolean).join(' ')}
      title={title} disabled={locked}
      onClick={e => { e.stopPropagation(); onClick?.() }}>
      {children}
    </button>
  )
}

/* ---------------------------- Find ----------------------------
   The search field, stuck to the top of a scrolling panel. One
   placeholder grammar: "Find a quest", "Find a place".
------------------------------------------------------------------ */

export function Sticky({ children }: { children: ReactNode }) {
  return <div className="panel-sticky">{children}</div>
}

export function Find({
  what, value, onChange, children,
}: {
  /** The noun. "an item" gives "Find an item". */
  what: string
  value: string
  onChange: (v: string) => void
  /** Anything else that should stay stuck to the top. */
  children?: ReactNode
}) {
  return (
    <Sticky>
      <input className="search" type="text" value={value} placeholder={`Find ${what}`}
        onChange={e => onChange(e.target.value)} />
      {children}
    </Sticky>
  )
}

/* ---------------------------- Hint / Empty ----------------------------
   Guidance, and the absence of things. One voice: plain, present
   tense, and an empty state says what will fill it rather than
   apologising for being empty.
------------------------------------------------------------------ */

/* ---------------------------- Field ----------------------------
   Somewhere to type. One line by default, several when `lines` is
   given. The label sits above in the same small grey the card's
   context line uses, so a form and a card read as the same family.
------------------------------------------------------------------ */

export function Field({
  label, value, onChange, placeholder, lines, onCommit,
}: {
  label?: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  /** Rows. Omit for a single-line field. */
  lines?: number
  /** Fired on Cmd/Ctrl-Enter, for fields with a send button beside them. */
  onCommit?: () => void
}) {
  const keys = (e: React.KeyboardEvent) => {
    if (onCommit && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onCommit()
  }
  return (
    <label className="field">
      {label && <span>{label}</span>}
      {lines
        ? <textarea rows={lines} value={value} placeholder={placeholder}
            onChange={e => onChange(e.target.value)} onKeyDown={keys} />
        : <input type="text" value={value} placeholder={placeholder}
            onChange={e => onChange(e.target.value)} onKeyDown={keys} />}
    </label>
  )
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="empty">{children}</p>
}

/** The one no-search-results line, so it reads the same in every panel. */
export function NoMatch({ what }: { what: string }) {
  return <p className="empty">No {what} matches that.</p>
}
