import { useEffect, useState, useCallback } from 'react'

export interface Toast { id: number; text: string }

/* Confirmations for actions whose effect happens off-screen \u2014 a token
   sent to another map, a reveal pushed to one player. Everything else
   is visible where it happened and needs no announcement. */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((text: string) => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, text }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600)
  }, [])
  return { toasts, push }
}

export function ToastRail({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map(t => <div key={t.id} className="toast">{t.text}</div>)}
    </div>
  )
}

