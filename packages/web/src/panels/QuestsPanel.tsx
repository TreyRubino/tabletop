import { useState } from 'react'
import { TABLE, target, type EntityId } from '@tabletop/core'
import { isDM } from '../shell'
import type { ShellState } from '../shell'
import { Card, Action, Find, Empty, NoMatch } from '../ui/kit'

/* ------------------------------------------------------------------
   Stages form a graph. The DM advances by choosing a branch, so what
   the players are told and what actually happens stay in step.

   A quest is a Card: its name, whether the table can see it, where it
   stands in its own graph, the words the players have been given, and
   the DM's truth underneath. The branches are its controls; the whole
   graph folds away beneath them.
------------------------------------------------------------------ */

export function QuestsPanel({ world, dm, selectedQuest, setSelectedQuest }: ShellState) {
  const [q, setQ] = useState('')
  if (world.quests.length === 0) {
    return <Empty>Nothing yet. Go and find something.</Empty>
  }
  const secrets = isDM(world) ? world.secrets : null

  const needle = q.trim().toLowerCase()
  const shown = world.quests.filter(quest =>
    !needle
    || quest.title.toLowerCase().includes(needle)
    || (quest.stageText ?? '').toLowerCase().includes(needle))

  return (
    <div className="quests">
      <Find what="a quest" value={q} onChange={setQ} />

      {shown.length === 0 && <NoMatch what="quest" />}

      {shown.map(quest => {
        const known = !dm
          || (dm.session.reveals[TABLE] ?? []).includes(target(quest.id as EntityId))
        const sec = secrets?.quests[quest.id]
        const step = sec ? sec.allStages.findIndex(s => s.id === quest.stageId) + 1 : 0
        const ways = sec?.options.length ?? 0

        return (
          <Card key={quest.id}
            title={quest.title}
            tag={known ? undefined : 'players cannot see it'}
            tagTone="hidden"
            meta={sec
              ? <>
                step <strong>{step || 1}</strong> of <strong>{sec.stageCount}</strong>
                {' \u00b7 '}
                {ways > 0
                  ? <><strong>{ways}</strong> way{ways === 1 ? '' : 's'} forward</>
                  : <>ends here</>}
              </>
              : <>on your list{' \u00b7 '}shared with the table</>}
            body={quest.stageText || undefined}
            hidden={!known}
            active={selectedQuest === quest.id}
            onOpen={() => setSelectedQuest(quest.id)}
            openTitle={`Read ${quest.title}`}
            acts={dm ? <>
              <Action on={known} onClick={() => {
                const targets = [
                  target(quest.id as EntityId),
                  target(quest.id as EntityId, 'stage'),
                ]
                dm.send(known
                  ? { t: 'conceal', audience: TABLE, targets }
                  : { t: 'reveal', audience: TABLE, targets })
                dm.toast(known
                  ? `${quest.title} hidden from the table`
                  : `${quest.title} is now on every screen`)
              }}>{known ? 'on every screen' : 'show'}</Action>

              {sec?.options.map(o => (
                <Action key={o.goto}
                  title={`Advance ${quest.title}`}
                  onClick={() => {
                    dm.send({ t: 'questStage', quest: quest.id as never, stage: o.goto })
                    dm.toast(`${quest.title}: ${o.label}`)
                  }}>
                  {o.label}
                </Action>
              ))}
            </> : undefined}>

            {/* The whole graph, so the DM can see where a branch leads
                and jump back if the table went somewhere unexpected. */}
            {dm && sec && (
              <details className="stage-map">
                <summary>all {sec.stageCount} steps</summary>
                {sec.allStages.map(st => (
                  <button key={st.id}
                    className={`stage-jump sheen ${st.id === quest.stageId ? 'is-on' : ''}`}
                    onClick={e => {
                      e.stopPropagation()
                      dm.send({ t: 'questStage', quest: quest.id as never, stage: st.id })
                    }}>
                    <span className="stage-id">{st.id}</span>
                    <span className="stage-text">{st.playerText}</span>
                  </button>
                ))}
              </details>
            )}
          </Card>
        )
      })}
    </div>
  )
}
