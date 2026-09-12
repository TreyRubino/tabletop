import { useCallback, useEffect, useRef, useState } from 'react'
import {
  TABLE, target, findActor, findTokenKind, cellsForFeet,
  type EntityId, type PlacementId, type World,
} from '@tabletop/core'
import { Stage, TokenDisc, PinMarker } from './ui/Stage'
import { ToastRail, type Toast } from './ui/Toasts'
import { PANELS } from './panels/panels'
import { Inspector } from './panels/Inspector'
import { activeScene, type DMControls, type ShellState } from './shell'
import type { Command } from '@tabletop/core'
import { Action } from './ui/kit'

export function Table({
  world, dm, send, toasts,
}: {
  world: World
  dm: DMControls | null
  send: (c: Command) => void
  toasts: Toast[]
}) {
  /* Deliberately not remembered: a session starts on the map, not in a
     panel, and which drawer was open last time is not information. */
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [selected, setSelectedOnly] = useState<string | null>(null)
  /* Tokens picked alongside the focused one. Selecting normally clears
     it, so `setSelected` still means "exactly this and nothing else"
     everywhere it is already called. */
  const [group, setGroup] = useState<string[]>([])
  const [selectedItem, setSelectedItemOnly] = useState<string | null>(null)
  const [selectedQuest, setSelectedQuestOnly] = useState<string | null>(null)
  const [selectedClock, setSelectedClockOnly] = useState<string | null>(null)
  /* The token the sidebar is describing. Separate from `selected`,
     which is the token your hand is on. Picking one up on the map must
     not throw away whatever you were reading. */
  const [readToken, setReadToken] = useState<string | null>(null)

  /* A token, an item, a quest and a clock are four answers to the same
     question, so choosing one always clears the rest — including when
     the answer is none of them. Clicking bare map clears all of them and
     the sidebar falls back to the place. */
  const only = (
    token: string | null, item: string | null,
    quest: string | null, clock: string | null,
  ) => {
    setSelectedOnly(token); setGroup([]); setReadToken(token)
    setSelectedItemOnly(item); setSelectedQuestOnly(quest); setSelectedClockOnly(clock)
  }
  /* Reading and pointing are two different acts. `setSelected` says
     "describe this on the right", and the panels use it. Clicking the
     map only picks a token up, so it sets the token and leaves whatever
     the sidebar was reading exactly where it was. */
  const setSelected = useCallback((id: string | null) => only(id, null, null, null), [])
  /* Dropping what is in your hand. Deliberately does not touch what the
     inspector is reading. */
  const setSelectedOnMap = useCallback((id: string | null) => {
    setSelectedOnly(id); setGroup([])
  }, [])
  const setSelectedItem = useCallback((id: string | null) => only(null, id, null, null), [])
  const setSelectedQuest = useCallback((id: string | null) => only(null, null, id, null), [])
  const setSelectedClock = useCallback((id: string | null) => only(null, null, null, id), [])
  const picked = (id: string) => id === selected || group.includes(id)
  const [arming, setArming] = useState<string | null>(null)
  const [crumbsOpen, setCrumbsOpen] = useState(false)
  /* The inspector is a scrolling column, and a new subject starts at
     its own beginning. Without this you open a short item after a long
     stat block and land halfway down a page whose top you never saw. */
  const inspector = useRef<HTMLElement>(null)
  useEffect(() => {
    inspector.current?.scrollTo({ top: 0 })
  }, [selected, selectedItem, selectedQuest, selectedClock, viewing])

  const dragging = useRef<PlacementId | null>(null)
  const draggingPin = useRef<string | null>(null)
  const draggingWay = useRef<string | null>(null)
  /** Where the drag began, and where each carried token was then. */
  const groupDrag = useRef<
    { ax: number; ay: number; items: { id: string; x: number; y: number }[] } | null
  >(null)
  const lastSent = useRef({ x: 0, y: 0 })
  const pinMoved = useRef(false)
  const moved = useRef(false)
  const frame = useRef<HTMLDivElement>(null)

  const scene = activeScene(world, viewing)
  const following = viewing === null || viewing === world.presented
  /* The shared display is furniture: it shows, it never operates. No
     rail, no drawer, nothing personal — information for the whole
     table, and only that. */
  const isTableScreen = world.role === 'player' && world.audience === 'table'
  const panels = isTableScreen
    ? []
    : PANELS.filter(p => (dm ? true : p.roles.includes('player')))

  const revealedToTable = useCallback((id: string, group = 'presence') =>
    !dm || (dm.session.reveals[TABLE] ?? []).includes(target(id as EntityId, group)),
    [dm])

  /* ---- keyboard: the DM's hands should stay off the mouse in a fight ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return

      if (isTableScreen) return
      if (/^[1-9]$/.test(e.key)) {
        const p = panels[Number(e.key) - 1]
        if (p) setOpenPanel(cur => (cur === p.id ? null : p.id))
        return
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [panels, isTableScreen])

  useEffect(() => {
    if (selected && scene && !scene.tokens.some(t => t.id === selected)) setSelectedOnMap(null)
    if (readToken && scene && !scene.tokens.some(t => t.id === readToken)) setReadToken(null)
  }, [scene, selected])

  /* Arming a token is a request to look at the map: the next click
     lands it. The drawer is over the map, so it gets out of the way. */
  useEffect(() => { if (arming) setOpenPanel(null) }, [arming])

  // Moving somewhere else re-collapses the trail.
  useEffect(() => { setCrumbsOpen(false) }, [scene?.id])

  /* A player's screen follows the DM. When what is being shown changes,
     anywhere they had wandered off to is dropped, so a party move lands
     on every screen at once instead of waiting for a rejoin. The DM's
     own camera stays independent, which is the whole point of it. */
  useEffect(() => { if (!dm) setViewing(null) }, [world.presented, dm])

  /* The drawer overlays the canvas, so a click anywhere outside it is a
     request for room. Capture phase, and deliberately not swallowed:
     the click still lands on whatever it hit. */
  /* The drawer used to close on any click outside it. It is a working
     surface, not a menu: you click the map constantly while it is open
     and losing the panel every time is worse than the space it costs.
     It closes on the X, on its own rail button, on its number key, and
     on its own when you arm a token to place. Nothing else. */

  const shell: ShellState = {
    world, dm, send, viewing, setViewing, selected, setSelected, arming, setArming,
    selectedItem, setSelectedItem,
    selectedQuest, setSelectedQuest,
    selectedClock, setSelectedClock,
    readToken,
  }
  const Panel = panels.find(p => p.id === openPanel)
  const armed = arming && dm ? findActor(dm.ir, arming) : null
  const presentedName = world.scenes.find(s => s.id === world.presented)?.name ?? null
  const unread = world.role === 'player'
    ? world.notes.filter(n => n.mine && !n.seen && !n.shared)
    : []

  /* Undecided notes only. Once the recipient chooses — share it or keep
     it — the prompt goes away and the note lives on in the Notes panel. */

  const placeHere = (x: number, y: number) => {
    if (!dm || !arming || !scene) return
    dm.send({ t: 'place', actor: arming as never, scene: scene.id as never, x, y })
    dm.toast(`${armed?.name ?? 'Token'} placed. It is hidden until you reveal it.`)
    setArming(null)
  }

  return (
    <div className={[
      'shell', dm ? 'is-dm' : 'is-player',
      isTableScreen ? 'is-table' : '', arming ? 'is-arming' : '',
    ].filter(Boolean).join(' ')}>
      {!isTableScreen && (
      <nav className="rail" aria-label="Panels">
        <div className="rail-mark" title={world.campaignTitle}>
          {world.campaignTitle.slice(0, 1)}
        </div>
        {panels.map((p, i) => (
          <button key={p.id}
            className={`rail-btn sheen ${openPanel === p.id ? 'is-on' : ''}`}
            onClick={() => setOpenPanel(openPanel === p.id ? null : p.id)}
            title={`${p.label}  (${i + 1})`} aria-label={p.label}
            aria-pressed={openPanel === p.id}>
            {p.icon}
          </button>
        ))}
        <div className="rail-spacer" />
        {dm && (
          <button className="rail-btn sheen" title={`Undo  (${dm.logLength})`} aria-label="Undo"
            onClick={dm.undo} disabled={dm.logLength === 0}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h11a5 5 0 0 1 0 10h-6" /><path d="M8 4 4 8l4 4" />
            </svg>
          </button>
        )}
      </nav>
      )}

      {Panel && (
        <section className="drawer" aria-label={Panel.label}>
          <header className="drawer-head">
            <h2>{Panel.label}</h2>
            <Action onClick={() => setOpenPanel(null)} aria-label="Close panel">
              &times;
            </Action>
          </header>
          <div className="drawer-body"><Panel.Component {...shell} /></div>
        </section>
      )}

      <main className="canvas">
        <header className="canvas-head">
          <nav className="trail" aria-label="Where you are">
            {(() => {
              const all = scene?.trail ?? []
              /* Where you are and where you came from always survive; the
                 rest collapse into one dot so the trail can never grow
                 into the controls. */
              const hidden = crumbsOpen ? [] : all.slice(0, Math.max(0, all.length - 2))
              const shownCrumbs = crumbsOpen ? all : all.slice(hidden.length)
              return (
                <>
                  {hidden.length > 0 && (
                    <>
                      <button className="crumb is-more sheen" onClick={() => setCrumbsOpen(true)}
                        title={hidden.map(h => h.name).join(' / ')}>&hellip;</button>
                      <span className="crumb-sep" aria-hidden>/</span>
                    </>
                  )}
                  {shownCrumbs.map((step, i) => (
                    <span key={step.id}>
                      {/* The step you are standing on wears the same lit
                          state everything chosen wears. It stays clickable:
                          clicking it points the sidebar back at this place. */}
                      <button
                        className={`crumb sheen ${step.id === all[all.length - 1]?.id ? 'is-on' : ''}`}
                        title={`Look at ${step.name}`}
                        onClick={() => { setViewing(step.id); setSelected(null) }}>
                        {step.name}
                      </button>
                      {i < shownCrumbs.length - 1 && <span className="crumb-sep" aria-hidden>/</span>}
                    </span>
                  ))}
                </>
              )
            })()}
          </nav>
          <div className="tools">
            {/* One control for both roles: it says what the shared screen
                is showing, and when you have wandered off it is also the
                way back. Inert when you are already there, so it never
                offers a journey of no distance. */}
            <button className={`looking sheen ${following ? '' : 'is-away'}`}
              disabled={following}
              title={following
                ? 'You are looking at what the table is looking at'
                : `Go to ${presentedName ?? 'what the table is seeing'}`}
              onClick={() => setViewing(null)}>
              <i className={`looking-dot ${following ? 'is-live' : ''}`} />
              {following
                ? 'the table sees this'
                : `the table sees ${presentedName ?? 'nothing'}`}
            </button>

          </div>
        </header>

        <div className="canvas-stage">
        {scene ? (
          <Stage
            background={scene.background}
            grid={scene.grid}
            viewport={!dm && following ? world.viewport : undefined}
            frameRef={frame}
            /* Bare map drops whatever is in your hand and leaves the
               sidebar alone. The map's own page is reached by clicking
               its name in the breadcrumbs, not by missing a token. */
            onBackgroundClick={() => setSelectedOnMap(null)}
            onClickAt={arming ? placeHere : undefined}
            onPointerMoveAt={(x, y) => {
              if (dragging.current) {
                moved.current = true
                const g = groupDrag.current
                if (g && g.items.length > 1) {
                  // Enough movement to be worth a command, so a group of
                  // five does not put five messages on the wire per frame.
                  if (Math.abs(x - lastSent.current.x) < 0.003
                    && Math.abs(y - lastSent.current.y) < 0.003) return
                  lastSent.current = { x, y }
                  for (const it of g.items) {
                    send({
                      t: 'moveToken', placement: it.id as PlacementId,
                      x: Math.min(1, Math.max(0, it.x + (x - g.ax))),
                      y: Math.min(1, Math.max(0, it.y + (y - g.ay))),
                    })
                  }
                  return
                }
                /* Players walk their own token; the server checks that it
                   is theirs and that they are not leaving the map. */
                send({ t: 'moveToken', placement: dragging.current, x, y })
              } else if (dm && draggingPin.current) {
                pinMoved.current = true
                dm.send({ t: 'movePin', scene: draggingPin.current as never, x, y })
              } else if (dm && draggingWay.current && scene) {
                pinMoved.current = true
                dm.send({
                  t: 'moveLink', from: scene.id as never,
                  to: draggingWay.current as never, x, y,
                })
              }
            }}
            onPointerUpAt={() => {
              dragging.current = null; draggingPin.current = null
              draggingWay.current = null; groupDrag.current = null
            }}
            marquee={!!dm && !arming}
            onMarquee={r => {
              if (!scene) return
              const lo = { x: Math.min(r.x1, r.x2), y: Math.min(r.y1, r.y2) }
              const hi = { x: Math.max(r.x1, r.x2), y: Math.max(r.y1, r.y2) }
              const hit = scene.tokens
                .filter(t => t.x >= lo.x && t.x <= hi.x && t.y >= lo.y && t.y <= hi.y)
                .map(t => t.id)
              setSelectedOnly(hit[0] ?? null)
              setGroup(hit.slice(1))
            }}
          >
            {scene.links.map(l => (
              <PinMarker key={`way-${l.id}`} name={l.name} x={l.x} y={l.y}
                draggable={!!dm && !arming}
                onPointerDown={e => {
                  if (!dm || arming) return
                  pinMoved.current = false
                  draggingWay.current = l.id
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }}
                onClick={() => {
                  if (!arming && !pinMoved.current) { setViewing(l.id); setSelectedOnMap(null) }
                }} />
            ))}

            {scene.pins.map(p => (
              <PinMarker key={p.id} name={p.name} x={p.x} y={p.y}
                hiddenFromPlayers={dm ? !revealedToTable(p.id) : undefined}
                draggable={!!dm && !arming}
                onPointerDown={e => {
                  if (!dm || arming) return
                  pinMoved.current = false
                  draggingPin.current = p.id
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }}
                onClick={() => {
                  // A drag corrects the map; only a clean click travels.
                  if (!arming && !pinMoved.current) { setViewing(p.id); setSelectedOnMap(null) }
                }} />
            ))}
            {/* Reach rings, under the tokens rather than over them. Only
                the selected token draws one: a ring on every creature at
                once is a plate of spaghetti, and the question "what can
                reach this square" is always asked about one of them. The
                radius is a share of the map's width, so it stays true
                through zoom and pan without being recomputed. */}
            {scene.grid && scene.tokens.map(t => {
              if (!t.reach || !picked(t.id)) return null
              /* Half a cell past the last square it can hit, so the ring
                 encloses those squares rather than cutting through their
                 middles and hugging the token. */
              const cells = cellsForFeet(scene.grid!, t.reach) + 0.5
              const width = (cells / scene.grid!.cols) * 200
              return (
                <div key={`reach:${t.id}`} className="tok-reach" aria-hidden
                  style={{
                    left: `${t.x * 100}%`, top: `${t.y * 100}%`,
                    width: `${width}%`, ['--tok' as string]: t.accent,
                  }} />
              )
            })}

            {scene.tokens.map(t => (
              <TokenDisc key={t.id} name={t.name} art={t.art} accent={t.accent} shape={t.shape}
                x={t.x} y={t.y} hp={t.hp} selected={selected === t.id}
                hiddenFromPlayers={dm ? !revealedToTable(t.id) : undefined}
                draggable={(!!dm || t.mine) && !arming}
                onPointerDown={e => {
                  if (arming) return
                  // Shift or the platform modifier adds and removes,
                  // rather than replacing the whole selection.
                  if (dm && (e.shiftKey || e.metaKey || e.ctrlKey)) {
                    if (picked(t.id)) {
                      if (t.id === selected) {
                        setSelectedOnly(group[0] ?? null)
                        setGroup(g => g.slice(1))
                      } else setGroup(g => g.filter(x => x !== t.id))
                    } else if (selected) setGroup(g => [...g, t.id])
                    else setSelectedOnly(t.id)
                    return
                  }
                  if (!picked(t.id)) setSelected(t.id)
                  if (!dm && !t.mine) return
                  moved.current = false
                  dragging.current = t.id as PlacementId
                  const carried = picked(t.id) ? [selected, ...group].filter(Boolean) as string[] : [t.id]
                  const here = new Map(scene.tokens.map(x => [x.id, x]))
                  groupDrag.current = {
                    ax: t.x, ay: t.y,
                    items: carried.flatMap(id => {
                      const tok = here.get(id)
                      return tok ? [{ id, x: tok.x, y: tok.y }] : []
                    }),
                  }
                  lastSent.current = { x: t.x, y: t.y }
                  ;(e.target as Element).setPointerCapture?.(e.pointerId)
                }} />
            ))}
          </Stage>
        ) : (
          <div className="stage-empty">
            <p>{dm ? 'This campaign has no scenes.' : 'Nothing has been shown to you yet.'}</p>
          </div>
        )}

        <div className="notif-col">
        {unread.length > 0 && openPanel !== 'notes' && (
          <div className="toast is-note">
            <span className="toast-eyebrow">Told to you alone</span>
            <p>{unread[0].text}</p>
            <div className="row">
              <Action onClick={() => send({ t: 'shareNote', note: unread[0].id })}>
                tell the others
              </Action>
              <Action onClick={() => send({ t: 'seeNote', note: unread[0].id })}>
                keep it to myself
              </Action>
              {unread.length > 1 && <span className="hint">{unread.length - 1} more</span>}
            </div>
          </div>
        )}

        <ToastRail toasts={toasts} />
        </div>
        </div>

        {armed && (
          <div className="arm-bar">
            <span className="arm-swatch" style={{
              ['--tok' as string]: findTokenKind(dm!.ir, armed.kind)?.accent ?? '#8f9bb0',
            }} />
            <span>Placing <strong>{armed.name}</strong> {'\u2014'} click the map</span>
            <Action onClick={() => setArming(null)}>cancel</Action>
          </div>
        )}
      </main>

      {!isTableScreen && (
        <aside className="inspector" ref={inspector}><Inspector {...shell} /></aside>
      )}

      {world.role === 'player' && world.banner && (
        <div className="banner"><p>{world.banner}</p></div>
      )}

    </div>
  )
}
