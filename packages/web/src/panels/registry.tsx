import type { ComponentType, JSX } from 'react'
import type { ShellState } from '../shell'

/* Panels are the only place the shell is extensible, because panels are
   the only thing that genuinely varies. Entity kinds, their field groups
   and their shapes are campaign data, not code. */

export interface Panel {
  id: string
  label: string
  icon: JSX.Element
  /** A panel absent from this list never renders for that role. */
  roles: ('dm' | 'player')[]
  Component: ComponentType<ShellState>
}

const s = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

export const icons = {
  scenes: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>,
  reveals: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" /><circle cx="12" cy="12" r="2.6" /></svg>,
  quests: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><path d="M4 5h16M4 12h10M4 19h13" /></svg>,
  clocks: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>,
  roster: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><circle cx="8" cy="8" r="3" /><path d="M3 20c0-3 2.2-5 5-5s5 2 5 5" /><path d="M16 4h5v5M21 4l-6 6M16 20h5v-5M21 20l-6-6" /></svg>,
  items: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><path d="M3 8.5 12 4l9 4.5v7L12 20l-9-4.5Z" /><path d="M3 8.5 12 13l9-4.5M12 13v7" /></svg>,
  whisper: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><path d="M21 12a8 8 0 0 1-8 8H7l-4 3V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" /><path d="M9 11h6M9 14h3" /></svg>,
  audience: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><circle cx="9" cy="9" r="3.2" /><path d="M3 19c0-3.2 2.7-5 6-5s6 1.8 6 5" /><path d="M16 6.5a3 3 0 0 1 0 5.6M18 19c0-2.3-.9-3.9-2.4-4.7" /></svg>,
}
