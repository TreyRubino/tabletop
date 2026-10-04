import { useEffect, useRef, useState } from 'react'
import type { World } from '@tabletop/core'
import { Stage } from './ui/Stage'
import { ToastRail, type Toast } from './ui/Toasts'
import { PANELS } from './panels/panels'
import { Inspector } from './panels/Inspector'
import { activeScene, type DMControls, type ShellState } from './shell'
import { Action } from './ui/kit'

export function Table({
  world, dm, toasts,
}: {
  world: World
  dm: DMControls | null
  toasts: Toast[]
}) {
  /* Deliberately not remembered: a session starts on the picture, not
     in a panel, and which drawer was open last time is not information. */
  const [openPanel, setOpenPanel] = useState<string | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)

  /* The inspector is a scrolling column, and a new subject starts at
     its own beginning. Without this you open a short scene after a
     long one and land halfway down a page whose top you never saw. */
  const inspector = useRef<HTMLElement>(null)

  const scene = activeScene(world, viewing)
  const following = viewing === null || viewing === world.presented
  /* The rail and its drawer are the DM's console: every control on
     them drives the room, and a player has nothing to drive. They are
     not rendered on a player's screen at all — not disabled, not
     greyed, absent — so a player gets the picture and the reading
     column and the shell closes up around them. The panels themselves
     are untouched and the DM's side is exactly as it was. */
  const panels = dm ? PANELS : []

  useEffect(() => { inspector.current?.scrollTo({ top: 0 }) }, [scene?.id])

  /* A player's screen follows the DM. When what is being shown changes,
     anywhere they had wandered off to is dropped, so the next scene
     lands on every screen at once instead of waiting for a rejoin. The
     DM's own camera stays independent, which is the whole point of it. */
  useEffect(() => { if (!dm) setViewing(null) }, [world.presented, dm])

  /* ---- keyboard: a number opens its panel, so the DM's hands can
     stay off the mouse while they are reading ---- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (/^[1-9]$/.test(e.key)) {
        const p = panels[Number(e.key) - 1]
        if (p) setOpenPanel(cur => (cur === p.id ? null : p.id))
      }
    }
    addEventListener('keydown', onKey)
    return () => removeEventListener('keydown', onKey)
  }, [panels])

  const shell: ShellState = { world, dm, viewing, setViewing }
  const Panel = panels.find(p => p.id === openPanel)
  const presentedName = world.scenes.find(s => s.id === world.presented)?.name ?? null

  return (
    <div className={['shell', dm ? 'is-dm' : 'is-player', Panel ? 'is-drawered' : '']
      .filter(Boolean).join(' ')}>
      {dm && (
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
        {/* The DM's bar. It says what the room is looking at and is the
            way back when they have wandered off — both of which are
            answers to a question only the DM can ask, since a player
            cannot wander anywhere. A player gets no bar at all, and
            the picture takes the height it was using. */}
        {dm && (
        <header className="canvas-head">
          {/* The trail used to hold this side open. It is gone, so the
              bar keeps one empty slot: the control it carries belongs
              on the right, where it has always been. */}
          <div className="canvas-head-gap" />
          <div className="tools">
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
        )}

        <div className="canvas-stage">
          {scene ? (
            <Stage image={scene.showing?.file ?? null} />
          ) : (
            <div className="stage-empty">
              <p>This campaign has no scenes.</p>
            </div>
          )}

          <div className="notif-col">
            <ToastRail toasts={toasts} />
          </div>
        </div>

      </main>

      {/* The reading column is hidden. Nothing about it is deleted —
          the inspector still renders the scene's markdown and the world
          still carries it — but neither screen gives it room: the
          picture is what this tool is for. */}
      {false && <aside className="inspector" ref={inspector}><Inspector {...shell} /></aside>}
    </div>
  )
}
