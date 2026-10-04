import type { ComponentType, JSX } from 'react'
import type { ShellState } from '../shell'

/* Panels are the only place the shell is extensible. There is one
   today, and the list is what makes a second one cheap. */

export interface Panel {
  id: string
  label: string
  icon: JSX.Element
  Component: ComponentType<ShellState>
}

const s = {
  fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
}

export const icons = {
  scenes: <svg viewBox="0 0 24 24" width="18" height="18" {...s}><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></svg>,
}
