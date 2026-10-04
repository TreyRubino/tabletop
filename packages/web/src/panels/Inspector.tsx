import { useState } from 'react'
import {
  TABLE, PRESENCE, IDENTITY, HEALTH, target, findTokenKind,
  type EntityId, type PublicEntry, type PublicToken, type AudienceId,
} from '@tabletop/core'
import type { StatBlock } from '@tabletop/core'
import { activeScene, isDM } from '../shell'
import { Action, Hint, Empty } from '../ui/kit'
import type { ShellState } from '../shell'

/* ------------------------------------------------------------------
   One inspector for both roles. A player sees exactly what has been
   revealed to them; the DM sees that plus dm-group content, which
   arrives through the secrets sidecar and has no path into the player
   branch of the union.
------------------------------------------------------------------ */

export function Inspector(shell: ShellState) {
  const { world, viewing, readToken, selectedItem, selectedQuest, selectedClock } = shell
  const scene = activeScene(world, viewing)
  const token = scene?.tokens.find(t => t.id === readToken) ?? null
  const item = world.items.find(i => i.id === selectedItem) ?? null
  const quest = world.quests.find(q => q.id === selectedQuest) ?? null
  const clock = world.clocks.find(k => k.id === selectedClock) ?? null

  /* Five things can be the subject and only one ever is, so pick it
     first and render it once. A chain of nested ternaries five deep
     was becoming a puzzle rather than a switch. */
  if (item) return <ItemCard shell={shell} item={item} />
  if (clock) return <ClockCard shell={shell} clock={clock} />
  if (quest) return <QuestCard shell={shell} quest={quest} />
  if (token) return <TokenCard shell={shell} token={token} />
  if (scene) return <SceneCard shell={shell} sceneId={scene.id} />

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>Nothing on screen</h2>
          <p className="insp-kind">pick a place to begin</p>
        </div>
      </header>
      <Empty>Choose somewhere in Places and it will open here.</Empty>
    </div>
  )
}

/* ------------------------------------------------------------------
   An item, read the way a creature is read: picture first, then what
   it is, then what it does, and the DM's line about it last. Same
   card shape as a token so the sidebar has one voice.
------------------------------------------------------------------ */
function ItemCard({
  shell, item,
}: {
  shell: ShellState
  item: {
    id: string; name: string; group: string; art: string | null
    text: string | null; detail: string | null; stats: StatBlock | null
  }
}) {
  const { world, dm } = shell
  const secret = isDM(world) ? world.secrets.itemSecrets[item.id] : null
  const held = dm
    ? dm.ir.audiences.filter(a =>
        (dm.session.reveals[a.id] ?? []).includes(target(item.id as EntityId)))
    : []

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{item.name}</h2>
          <p className="insp-kind">{item.group}</p>
        </div>
      </header>

      {item.art && (
        <figure className="insp-portrait">
          <img src={`/assets/${item.art}`} alt={item.name}
            onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
        </figure>
      )}

      {item.text && <p className="prose">{item.text}</p>}
      {item.detail && <p className="prose item-detail">{item.detail}</p>}

      {secret && <p className="truth">{secret}</p>}

      {dm && (
        <Hint>
          {held.length === 0
            ? 'Nobody has this yet.'
            : `Held by ${held.map(a => a.name).join(', ')}.`}
        </Hint>
      )}

      {item.stats && <StatBlockCard stats={item.stats} />}
    </div>
  )
}

/* ------------------------------------------------------------------
   A quest, read rather than driven. Its controls — showing it to the
   table, taking a branch, jumping to a stage — stay on the card in the
   Quests panel. What lands here is what the players have been told and,
   underneath it, what is actually going on.
------------------------------------------------------------------ */

/* ------------------------------------------------------------------
   A clock, read rather than wound. Its controls — showing it, stepping
   it — stay on the card in the Clocks panel. What lands here is where
   it stands, the newest thing the players have been told, and beneath
   that what is actually happening and what happens next.
------------------------------------------------------------------ */

function ClockCard({
  shell, clock,
}: {
  shell: ShellState
  clock: { id: string; name: string; caption: string; ticks: number | null; max: number
    latestText: string | null }
}) {
  const { world } = shell
  const sec = isDM(world) ? world.secrets : null
  const now = sec?.clockNow[clock.id]
  const next = sec?.clockNext[clock.id]
  const note = sec?.clockNotes[clock.id]

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{clock.name}</h2>
          <p className="insp-kind">Clock</p>
        </div>
      </header>

      <Hint>{clock.ticks === null
        ? 'You know this exists, not where it stands.'
        : `${clock.ticks} of ${clock.max} filled.`}</Hint>

      {clock.caption && <p className="prose">{clock.caption}</p>}
      {clock.latestText && <blockquote className="read"><p>{clock.latestText}</p></blockquote>}

      {now && <p className="truth">{now}</p>}
      {note && <p className="truth">{note}</p>}

      {next && (
        <section className="cues">
          <h3>Next step</h3>
          <p className="prose">{next}</p>
        </section>
      )}
    </div>
  )
}

function QuestCard({
  shell, quest,
}: {
  shell: ShellState
  quest: { id: string; title: string; stageText: string | null; stageId: string }
}) {
  const { world } = shell
  const sec = isDM(world) ? world.secrets.quests[quest.id] : null
  const step = sec ? sec.allStages.findIndex(s => s.id === quest.stageId) + 1 : 0

  /* Everything behind them. The stage they are standing on is already
     the prose above, so it is dropped here rather than printed twice —
     the same duplication that made the reveals page unreadable. */
  const behind = (sec?.path ?? []).filter(st => st.id !== quest.stageId)

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{quest.title}</h2>
          <p className="insp-kind">Quest</p>
        </div>
      </header>

      {sec && <Hint>Step {step || 1} of {sec.stageCount}.</Hint>}

      {quest.stageText && <p className="prose">{quest.stageText}</p>}
      {sec?.dmText && <p className="truth">{sec.dmText}</p>}

      {!quest.stageText && !sec?.dmText && (
        <Empty>Nothing written for this step yet.</Empty>
      )}

      {behind.length > 0 && (
        <section className="cues">
          <h3>How they got here</h3>
          {behind.map((st, i) => (
            <div key={`${st.id}-${i}`} className="cue">
              <span className="cue-when">Step {i + 1}</span>
              <p>{st.playerText}</p>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}

function SceneCard({ shell, sceneId }: { shell: ShellState; sceneId: string }) {
  const { world, dm } = shell
  const scene = world.scenes.find(s => s.id === sceneId)!
  const prep = isDM(world) ? world.secrets.scenePrep[sceneId] : null
  const cues = isDM(world) ? world.secrets.sceneCues[sceneId] ?? [] : []
  const options = isDM(world) ? world.secrets.sceneOptions[sceneId] ?? [] : []

  const readAloud = scene.entries.filter(e => e.style === 'read')
  const rest = scene.entries.filter(e => e.style !== 'read')

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{scene.name}</h2>
          <p className="insp-kind">Place</p>
        </div>
      </header>

      {scene.art && (
        <figure className="insp-portrait">
          <img src={`/assets/${scene.art}`} alt={scene.name}
            onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
        </figure>
      )}

      {readAloud.map(e => (
        <blockquote key={e.id} className="read">
          {e.label && <cite>{e.label}</cite>}
          <p>{e.text}</p>
        </blockquote>
      ))}

      {scene.description && <p className="prose">{scene.description}</p>}

      {rest.length > 0 && (
        <div className="entries">{rest.map(e => <EntryCard key={e.id} entry={e} />)}</div>
      )}

      {scene.entries.length === 0 && !scene.description && (
        <Empty>
          {dm ? 'No entries here yet. Add them under this scene in the campaign file.'
              : 'You have not learned anything here yet.'}
        </Empty>
      )}

      {prep && (
        <>
          <dl className="prep">
            {([['They want', prep.want],
               ['It can hurt them', prep.threat],
               ['Something is wrong', prep.wrong]] as [string, string][]).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd className={v ? '' : 'is-blank'}>{v || 'not written'}</dd>
              </div>
            ))}
          </dl>
          {prep.notes && <p className="truth">{prep.notes}</p>}
        </>
      )}

      {options.length > 0 && (
        <section className="affordances">
          <h3>They can</h3>
          <ul>{options.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </section>
      )}

      {cues.length > 0 && (
        <section className="cues">
          <h3>Cues</h3>
          {cues.map(q => (
            <div key={q.id} className="cue">
              {q.when && <span className="cue-when">{q.when}</span>}
              <p>{q.text}</p>
            </div>
          ))}
        </section>
      )}

    </div>
  )
}

function TokenCard({ shell, token }: { shell: ShellState; token: PublicToken }) {
  const { world, dm } = shell
  const secret = isDM(world) ? world.secrets.tokens[token.id] : null
  const kind = dm ? findTokenKind(dm.ir, token.kind) : null
  const [narrationAt, setNarrationAt] = useState(0)

  const name = token.name ?? secret?.actorName ?? 'Someone'
  const lines = secret?.narration ?? []

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{name}</h2>
          <p className="insp-kind">{kind?.label ?? token.kind}</p>
        </div>
      </header>

      {token.art && (
        <figure className={`insp-portrait ${token.party ? 'is-pc' : ''}`}
          style={{ ['--tok' as string]: token.accent }}>
          <img src={`/assets/${token.art}`} alt={name}
            onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
        </figure>
      )}

      {lines.length > 0 && (
        <section className="narration">
          <h3>Read when it acts</h3>
          <p className="prose">{lines[narrationAt % lines.length]}</p>
          {lines.length > 1 && (
            <Action onClick={() => setNarrationAt(n => n + 1)}>
              another ({(narrationAt % lines.length) + 1} of {lines.length})
            </Action>
          )}
        </section>
      )}

      {dm && kind?.hasSecrets && (
        <Hint>Some of this creature has no public representation — it is
        yours to read out, not to reveal.</Hint>
      )}

      {token.hp && (
        <div className="hp">
          <div className="hp-bar">
            <span style={{ width: `${(token.hp.current / token.hp.max) * 100}%` }} />
          </div>
          {dm ? (
            <div className="hp-controls">
              <Action onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current - 5 })}>&minus;5</Action>
              <Action onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current - 1 })}>&minus;1</Action>
              <span>{token.hp.current} / {token.hp.max}</span>
              <Action onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current + 1 })}>+1</Action>
              <Action onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current + 5 })}>+5</Action>
            </div>
          ) : (
            <span className="hp-count">{token.hp.current} / {token.hp.max}</span>
          )}
        </div>
      )}

      {token.entries.length > 0 && (
        <div className="entries">
          {token.entries.map(e => <EntryCard key={e.id} entry={e} />)}
        </div>
      )}

      {token.entries.length === 0 && (
        <Empty>
          {dm ? 'Nothing revealed to the table yet.' : 'You do not know anything about this yet.'}
        </Empty>
      )}

      {secret && secret.entries.length > 0 && (
        <div className="entries is-secret">
          {secret.entries.map(e => <EntryCard key={e.id} entry={e} secret />)}
        </div>
      )}
      {secret?.note && <p className="truth">{secret.note}</p>}

      {/* The stat block is last on every card. What it looks like, how
          to play it and what a player might already know are what you
          need on opening; the numbers are what you need once the dice
          are out. */}
      {secret?.stats && <StatBlockCard stats={secret.stats} />}

      {/* Numbers last. What it looks like, what it wants and how to play
          it decide the scene; the stat block is a table you consult once
          somebody swings. */}
    </div>
  )
}

/* The whole block, laid out to be read at speed under pressure: the
   defensive line first, then the numbers you roll against, then what it
   actually does on its turn. The engine never interprets a row. */
function StatBlockCard({ stats }: { stats: StatBlock }) {
  return (
    <section className="statblock">
      {stats.summary && <p className="sb-summary">{stats.summary}</p>}

      {stats.bar.length > 0 && (
        <div className="sb-bar">
          {stats.bar.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </div>
      )}

      {stats.abilities.length > 0 && (
        <div className="sb-abilities">
          {stats.abilities.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </div>
      )}

      {stats.meta.length > 0 && (
        <dl className="sb-meta">
          {stats.meta.map(([k, v]) => (
            <div key={k}><dt>{k}</dt><dd>{v}</dd></div>
          ))}
        </dl>
      )}

      {stats.sections.map(sec => (
        <div key={sec.label} className="sb-section">
          <h4>{sec.label}</h4>
          {sec.rows.map(([k, v]) => (
            <p key={k}><strong>{k}.</strong> {v}</p>
          ))}
        </div>
      ))}
    </section>
  )
}

function EntryCard({ entry, secret }: { entry: PublicEntry; secret?: boolean }) {
  return (
    <figure className={`entry ${secret ? 'is-secret' : ''}`}>
      {entry.image && (
        <img src={`/assets/${entry.image}`} alt={entry.label ?? ''}
          onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
      )}
      {entry.label && <figcaption>{entry.label}</figcaption>}
      {entry.text && <p className="prose">{entry.text}</p>}
    </figure>
  )
}

const CHIP: Record<string, string> = {
  [PRESENCE]: 'on screen', [IDENTITY]: 'who it is', [HEALTH]: 'health',
}
const chipLabel = (g: string) => CHIP[g] ?? g
