import { icons, type Panel } from './registry'
import { ScenesPanel } from './ScenesPanel'
import { RosterPanel } from './RosterPanel'
import { RevealsPanel } from './RevealsPanel'
import { QuestsPanel } from './QuestsPanel'
import { ClocksPanel } from './ClocksPanel'
import { ItemsPanel } from './ItemsPanel'
import { NotesPanel } from './NotesPanel'

export const PANELS: Panel[] = [
  { id: 'scenes', label: 'Places', icon: icons.scenes, roles: ['dm', 'player'], Component: ScenesPanel },
  { id: 'reveals', label: 'Reveals', icon: icons.reveals, roles: ['dm'], Component: RevealsPanel },
  { id: 'roster', label: 'Roster', icon: icons.roster, roles: ['dm'], Component: RosterPanel },
  { id: 'quests', label: 'Quests', icon: icons.quests, roles: ['dm', 'player'], Component: QuestsPanel },
  { id: 'items', label: 'Items', icon: icons.items, roles: ['dm', 'player'], Component: ItemsPanel },
  { id: 'notes', label: 'Notes', icon: icons.whisper, roles: ['dm', 'player'], Component: NotesPanel },
  { id: 'clocks', label: 'Clocks', icon: icons.clocks, roles: ['dm', 'player'], Component: ClocksPanel },
]
