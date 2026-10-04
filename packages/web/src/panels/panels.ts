import { icons, type Panel } from './registry'
import { ScenesPanel } from './ScenesPanel'

/* One tab. The app shows pictures and holds the words you read beside
   them, so there is one thing to operate and one panel to operate it
   from. */

export const PANELS: Panel[] = [
  { id: 'scenes', label: 'Scenes', icon: icons.scenes, Component: ScenesPanel },
]
