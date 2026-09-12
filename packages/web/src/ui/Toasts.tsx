import { useEffect, useState, useCallback } from 'react'

export interface Toast {
  id: number
  text: string
  /* A clock advancing is news with a shape: the track comes with it,
     and then leaves again like any other notification. */
  clock?: { name: string; ticks: number; max: number } | null
}

/* Confirmations for actions whose effect happens off-screen \u2014 a token
   sent to another map, a reveal pushed to one player. Everything else
   is visible where it happened and needs no announcement. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string, clock?: Toast['clock']) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, text, clock }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])
  return { toasts, push }
}

export function ToastRail({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`toast ${t.clock ? 'is-clock' : ''}`}>
          {t.clock && (
            <>
              <span className="toast-eyebrow">{t.clock.name}</span>
              <span className="toast-track" role="img"
                aria-label={`${t.clock.ticks} of ${t.clock.max}`}>
                {Array.from({ length: t.clock.max }, (_, i) =>
                  <i key={i} className={i < t.clock!.ticks ? 'is-filled' : ''} />)}
              </span>
            </>
          )}
          {t.text}
        </div>
      ))}
    </div>
  )
}

