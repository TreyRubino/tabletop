import { useState } from 'react'
import { TABLE, target, type EntityId } from '@tabletop/core'
import { isDM } from '../shell'
import type { ShellState } from '../shell'
import { Section } from '../ui/Section'

/* Stages form a graph. The DM advances by choosing a branch, so what
   the players are told and what actually happens stay in step. */

export function QuestsPanel({ world, dm }: ShellState) {
  const [q, setQ] = useState('')
  if (world.quests.length === 0) return <p className="empty">Nothing yet. Go and find something.</p>
  const secrets = isDM(world) ? world.secrets : null

  const needle = q.trim().toLowerCase()
  const shown = world.quests.filter(quest =>
    !needle
    || quest.title.toLowerCase().includes(needle)
    || (quest.stageText ?? '').toLowerCase().includes(needle))

  return (
    <div className="quests">
      <div className="panel-sticky">
        <input className="search" type="text" value={q} placeholder="Find a quest"
          onChange={e => setQ(e.target.value)} />
      </div>

      {shown.length === 0 && <p className="empty">Nothing matches.</p>}

      {shown.map(q => {
        const known = !dm || (dm.session.reveals[TABLE] ?? []).includes(target(q.id as EntityId))
        const sec = secrets?.quests[q.id]
        return (
          <Section key={q.id} id={`quest:${q.id}`} label={q.title}
            tone={known ? undefined : 'hidden'}>
            <header>
              {dm && (
                <button className="ghost" onClick={() => dm.send(known
                  ? { t: 'conceal', audience: TABLE, targets: [target(q.id as EntityId), target(q.id as EntityId, 'stage')] }
                  : { t: 'reveal', audience: TABLE, targets: [target(q.id as EntityId), target(q.id as EntityId, 'stage')] })}>
                  {known ? 'hide' : 'show'}
                </button>
              )}
            </header>
            {q.stageText && <p className="prose">{q.stageText}</p>}
            {sec?.dmText && <p className="truth">{sec.dmText}</p>}

            {dm && sec && (
              <>
                {sec.options.length > 0 ? (
                  <div className="branches">
                    <span className="branch-label">What happens next</span>
                    {sec.options.map(o => (
                      <button key={o.goto} className="branch"
                        onClick={() => {
                          dm.send({ t: 'questStage', quest: q.id as never, stage: o.goto })
                          dm.toast(`${q.title}: ${o.label}`)
                        }}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="hint">This quest ends here.</p>
                )}

                {/* The whole graph, so the DM can see where a branch leads
                    and jump back if the table went somewhere unexpected. */}
                <details className="stage-map">
                  <summary>all {sec.stageCount} steps</summary>
                  {sec.allStages.map(st => (
                    <button key={st.id}
                      className={`stage-jump ${st.id === q.stageId ? 'is-here' : ''}`}
                      onClick={() => dm.send({ t: 'questStage', quest: q.id as never, stage: st.id })}>
                      <span className="stage-id">{st.id}</span>
                      <span className="stage-text">{st.playerText}</span>
                    </button>
                  ))}
                </details>
              </>
            )}
          </Section>
        )
      })}
    </div>
  )
}
