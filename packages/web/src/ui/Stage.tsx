import {
  useEffect, useLayoutEffect, useRef, useState,
  type ReactNode, type PointerEvent,
} from 'react'
import type { Viewport, TokenShape, Grid } from '@tabletop/core'

/* ------------------------------------------------------------------
   The stage holds a *world*: a box with exactly the background image's
   aspect ratio, letterboxed inside whatever shape the window happens to
   be. Tokens, pins and the grid live in world coordinates, so a pin at
   (0.576, 0.786) is on Phandalin at every window size and on every
   player's differently-shaped laptop. One coordinate space, and it is
   the image's.
------------------------------------------------------------------ */

export interface StageProps {
  background: string | null
  grid?: Grid | null
  viewport?: Viewport
  children: ReactNode
  onBackgroundClick?: () => void
  /** Placement mode only: fires with world coordinates. */
  onClickAt?: (x: number, y: number) => void
  onPointerMoveAt?: (x: number, y: number, e: PointerEvent) => void
  onPointerUpAt?: () => void
  frameRef?: React.RefObject<HTMLDivElement>
  /** Drag on empty map to sweep up tokens. DM only. */
  marquee?: boolean
  onMarquee?: (r: { x1: number; y1: number; x2: number; y2: number }) => void
}

export function Stage({
  background, grid, viewport, children, onBackgroundClick, onClickAt,
  onPointerMoveAt, onPointerUpAt, frameRef, marquee, onMarquee,
}: StageProps) {
  const own = useRef<HTMLDivElement>(null)
  const ref = frameRef ?? own
  const clip = useRef<HTMLDivElement>(null)

  /* ----------------------------------------------------------------
     Zoom is a local view, not world state: it is never sent, never
     logged, and never moves anybody else's screen. Two people can be
     looking at the same map at different magnifications.

     The transform is scale(z) translate((0.5-x), (0.5-y)), so a point
     at element-normalised position p sits at z*(p-x) from the centre.
     Holding a point still while z changes is therefore
     x' = p - (z/z')*(p - x), which is what makes the wheel zoom toward
     the pointer rather than the middle.
  ---------------------------------------------------------------- */
  const [view, setView] = useState<Viewport>(viewport ?? { x: 0.5, y: 0.5, zoom: 1 })
  const v = view

  // A different map starts at full view rather than wherever you left off.
  useEffect(() => { setView(viewport ?? { x: 0.5, y: 0.5, zoom: 1 }) }, [background, viewport])

  /** Keep the visible window inside the image; at 1x there is nowhere to go. */
  const hold = (c: number, z: number) =>
    z <= 1 ? 0.5 : Math.min(Math.max(c, 0.5 / z), 1 - 0.5 / z)

  const zoomAt = (px: number, py: number, factor: number) => setView(cur => {
    const zoom = Math.min(Math.max(cur.zoom * factor, 1), 8)
    if (zoom === cur.zoom) return cur
    const k = cur.zoom / zoom
    return {
      zoom,
      x: hold(px - k * (px - cur.x), zoom),
      y: hold(py - k * (py - cur.y), zoom),
    }
  })

  /* The browser scrolls on wheel by default and React attaches wheel
     passively, so this one is bound by hand to be preventable. */
  useEffect(() => {
    const el = clip.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      zoomAt((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height,
        Math.exp(-e.deltaY * 0.0016))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [ref])

  /** Middle-drag anywhere, or shift-drag on bare map. */
  const pan = useRef<{ sx: number; sy: number; x: number; y: number } | null>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  /** Natural aspect of the background, width over height. */
  const [aspect, setAspect] = useState<number | null>(null)
  const [sweep, setSweep] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const sweeping = useRef(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setBox({ w: r.width, h: r.height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])

  /* Contain-fit: the whole image is always on screen at zoom 1. */
  const fit = (() => {
    if (!box.w || !box.h) return { left: 0, top: 0, w: box.w, h: box.h }
    const a = background && aspect ? aspect : box.w / box.h
    const w = Math.min(box.w, box.h * a)
    const h = w / a
    return { left: (box.w - w) / 2, top: (box.h - h) / 2, w, h }
  })()

  /** Client point to world coordinates. Uniform transforms preserve
      normalised positions, so the transformed rect is safe to divide by. */
  const toWorld = (e: PointerEvent) => {
    const r = ref.current?.getBoundingClientRect()
    if (!r || !fit.w || !fit.h) return null
    const nx = (e.clientX - r.left) / r.width
    const ny = (e.clientY - r.top) / r.height
    return {
      x: Math.min(1, Math.max(0, (nx * box.w - fit.left) / fit.w)),
      y: Math.min(1, Math.max(0, (ny * box.h - fit.top) / fit.h)),
    }
  }

  const isBackdrop = (el: EventTarget | null) =>
    el === ref.current || (el instanceof HTMLElement && el.dataset.world !== undefined)

  const cell = grid && fit.w ? fit.w / grid.cols : 0
  const rows = cell ? Math.round(fit.h / cell) : 0

  return (
    <div
      className={`stage-clip ${v.zoom > 1 ? 'is-zoomed' : ''}`}
      ref={clip}
      onPointerDown={e => {
        const bare = isBackdrop(e.target)
        if (e.button !== 1 && !(e.button === 0 && e.shiftKey && bare)) return
        e.preventDefault()
        pan.current = { sx: e.clientX, sy: e.clientY, x: v.x, y: v.y }
        ;(e.currentTarget as Element).setPointerCapture(e.pointerId)
      }}
      onPointerMove={e => {
        const p = pan.current
        if (!p) return
        const r = ref.current?.getBoundingClientRect()
        if (!r) return
        setView(cur => ({
          ...cur,
          x: hold(p.x - (e.clientX - p.sx) / r.width, cur.zoom),
          y: hold(p.y - (e.clientY - p.sy) / r.height, cur.zoom),
        }))
      }}
      onPointerUp={e => {
        if (!pan.current) return
        pan.current = null
        ;(e.currentTarget as Element).releasePointerCapture(e.pointerId)
      }}
    >
      <div
        className="stage"
        ref={ref}
        style={{ transform: `scale(${v.zoom}) translate(${(0.5 - v.x) * 100}%, ${(0.5 - v.y) * 100}%)` }}
        onPointerDown={e => {
          if (e.button !== 0 || e.shiftKey) return
          if (onClickAt) {
            const p = toWorld(e)
            if (p) { onClickAt(p.x, p.y); return }
          }
          if (!isBackdrop(e.target)) return
          if (!marquee) { onBackgroundClick?.(); return }
          const p = toWorld(e)
          if (!p) return
          sweeping.current = true
          setSweep({ x1: p.x, y1: p.y, x2: p.x, y2: p.y })
          ref.current?.setPointerCapture(e.pointerId)
        }}
        onPointerMove={e => {
          if (sweeping.current) {
            const p = toWorld(e)
            if (p) setSweep(r => (r ? { ...r, x2: p.x, y2: p.y } : r))
            return
          }
          if (!onPointerMoveAt) return
          const p = toWorld(e)
          if (p) onPointerMoveAt(p.x, p.y, e)
        }}
        onPointerUp={e => {
          if (sweeping.current) {
            sweeping.current = false
            ref.current?.releasePointerCapture(e.pointerId)
            const r = sweep
            setSweep(null)
            // A press without a drag is still a click on empty map.
            if (!r || (Math.abs(r.x2 - r.x1) < 0.006 && Math.abs(r.y2 - r.y1) < 0.006)) {
              onBackgroundClick?.()
            } else {
              onMarquee?.(r)
            }
            return
          }
          onPointerUpAt?.()
        }}
      >
        <div
          className="world"
          data-world
          style={{ left: fit.left, top: fit.top, width: fit.w, height: fit.h }}
        >
          {background
            ? <img
                className="stage-bg"
                src={`/assets/${background}`}
                alt=""
                draggable={false}
                onLoad={e => {
                  const img = e.currentTarget
                  if (img.naturalWidth && img.naturalHeight) {
                    setAspect(img.naturalWidth / img.naturalHeight)
                  }
                }}
              />
            : <Backdrop />}

          {grid && grid.overlay && cell > 4 && (
            <div className="grid-overlay" aria-hidden
              style={{ backgroundSize: `${cell}px ${cell}px` }} />
          )}

          {children}

          {sweep && (
            <div className="marquee" aria-hidden style={{
              left: `${Math.min(sweep.x1, sweep.x2) * 100}%`,
              top: `${Math.min(sweep.y1, sweep.y2) * 100}%`,
              width: `${Math.abs(sweep.x2 - sweep.x1) * 100}%`,
              height: `${Math.abs(sweep.y2 - sweep.y1) * 100}%`,
            }} />
          )}
        </div>
      </div>

      {/* Discoverable and resettable: the wheel is the fast way, this is
          the one you can find without being told. */}
      <div className="zoomer">
        <button title="Zoom out" aria-label="Zoom out" disabled={v.zoom <= 1}
          onClick={() => zoomAt(v.x, v.y, 1 / 1.4)}>&minus;</button>
        <button className="zoomer-now" title="Back to the whole map"
          disabled={v.zoom === 1} onClick={() => setView({ x: 0.5, y: 0.5, zoom: 1 })}>
          {Math.round(v.zoom * 100)}%
        </button>
        <button title="Zoom in" aria-label="Zoom in" disabled={v.zoom >= 8}
          onClick={() => zoomAt(v.x, v.y, 1.4)}>+</button>
      </div>

      {grid && cell > 4 && (
        <div className="scale-bar" aria-hidden>
          <span style={{ width: `${cell}px` }} />
          <em>{grid.unit} {grid.label}</em>
          {rows > 0 && <small>{grid.cols} {'\u00d7'} {rows}</small>}
        </div>
      )}
    </div>
  )
}

function Backdrop() {
  return (
    <svg className="stage-bg" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id="bd" x1="0" y1="0" x2="0.35" y2="1">
          <stop offset="0%" stopColor="#12171d" />
          <stop offset="100%" stopColor="#1e262f" />
        </linearGradient>
      </defs>
      <rect width="1600" height="900" fill="url(#bd)" />
    </svg>
  )
}

/* ---------------------------- tokens ---------------------------- */

const CLIP: Record<TokenShape, string> = {
  disc: 'circle(50% at 50% 50%)',
  hex: 'polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)',
  square: 'inset(0 round 14%)',
  diamond: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
  shield: 'polygon(50% 0%, 100% 14%, 100% 62%, 50% 100%, 0% 62%, 0% 14%)',
}

export interface DiscProps {
  name: string | null
  art: string | null
  accent: string
  shape: TokenShape
  x: number
  y: number
  hp?: { current: number; max: number } | null
  selected?: boolean
  hiddenFromPlayers?: boolean
  draggable?: boolean
  onPointerDown?: (e: PointerEvent) => void
}

export function TokenDisc({
  name, art, accent, shape, x, y, hp, selected, hiddenFromPlayers, draggable, onPointerDown,
}: DiscProps) {
  const initials = name
    ? name.replace(/^The\s+/i, '').split(' ').map(w => w[0]).join('').slice(0, 2)
    : null

  /* A zero-size anchor at the exact coordinate. The ring is centred on
     it; the name and health hang below it. Nothing about the label's
     size can move the ring off its point. */
  return (
    <div
      className={[
        'tok', `tok-${shape}`,
        selected ? 'is-selected' : '',
        hiddenFromPlayers ? 'is-hidden' : '',
        draggable ? 'is-draggable' : '',
        name ? '' : 'is-anon',
      ].filter(Boolean).join(' ')}
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, ['--tok' as string]: accent }}
      onPointerDown={onPointerDown}
    >
      <div className="tok-ring" style={{ clipPath: CLIP[shape] }}>
        <div className="tok-fill" style={{ clipPath: CLIP[shape] }}>
          {art
            ? <img src={`/assets/${art}`} alt="" draggable={false}
                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
            : <span className="tok-initials">{initials ?? ''}</span>}
        </div>
      </div>
      {hp && (
        <div className="tok-hp" aria-hidden>
          <span style={{ width: `${Math.max(0, (hp.current / hp.max) * 100)}%` }} />
        </div>
      )}
      {name && <div className="tok-name">{name}</div>}
    </div>
  )
}

export function PinMarker({
  name, x, y, hiddenFromPlayers, draggable, onClick, onPointerDown,
}: {
  name: string; x: number; y: number; hiddenFromPlayers?: boolean
  draggable?: boolean
  onClick?: () => void
  onPointerDown?: (e: PointerEvent) => void
}) {
  /* Same principle: the dot IS the coordinate. The label hangs off it
     and can be any length without dragging the dot sideways. */
  return (
    <button type="button"
      className={[
        'pin', hiddenFromPlayers ? 'is-hidden' : '', draggable ? 'is-draggable' : '',
      ].filter(Boolean).join(' ')}
      style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
      onClick={onClick} onPointerDown={onPointerDown} disabled={!onClick}>
      <span className="pin-dot" aria-hidden />
      <span className="pin-label">{name}</span>
    </button>
  )
}
