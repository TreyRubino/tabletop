import { useState } from 'react'
import {
  TABLE, PRESENCE, IDENTITY, HEALTH, target, findTokenKind,
  type EntityId, type PublicEntry, type PublicToken, type AudienceId,
} from '@tabletop/core'
import type { StatBlock } from '@tabletop/core'
import { activeScene, isDM } from '../shell'
import type { ShellState } from '../shell'

/* ------------------------------------------------------------------
   One inspector for both roles. A player sees exactly what has been
   revealed to them; the DM sees that plus dm-group content, which
   arrives through the secrets sidecar and has no path into the player
   branch of the union.
------------------------------------------------------------------ */

export function Inspector(shell: ShellState) {
  const { world, viewing, selected } = shell
  const scene = activeScene(world, viewing)
  const token = scene?.tokens.find(t => t.id === selected) ?? null

  return (
    <>
      <PartyStrip shell={shell} />
      {token
        ? <TokenCard shell={shell} token={token} />
        : scene
          ? <SceneCard shell={shell} sceneId={scene.id} />
          : <p className="empty">Nothing on screen.</p>}
    </>
  )
}

/* ------------------------------------------------------------------
   The party, always in view: portrait, health, and where each of them
   is standing right now. Clicking one jumps to them. Portraits come
   from the actor's art; without one, initials on the kind's colour.
   Wherever the party splits, the strip is how the DM keeps all of
   them in their head at once.
------------------------------------------------------------------ */
function PartyStrip({ shell }: { shell: ShellState }) {
  const { world, viewing, selected, setViewing, setSelected } = shell
  const members = world.scenes.flatMap(s =>
    s.tokens.filter(t => t.party).map(t => ({ t, scene: s })))
  if (members.length === 0) return null

  return (
    <div className="party is-sticky" role="list" aria-label="The party">
      {members.map(({ t, scene }) => {
        const initials = (t.name ?? '?')
          .replace(/^The\s+/i, '').split(' ').map(w => w[0]).join('').slice(0, 2)
        const here = viewing === scene.id || (!viewing && world.presented === scene.id)
        return (
          <button key={t.id} role="listitem"
            className={`party-card ${selected === t.id ? 'is-selected' : ''}`}
            style={{ ['--tok' as string]: t.accent }}
            title={`${t.name ?? 'Someone'} — ${scene.name}`}
            onClick={() => { setViewing(scene.id); setSelected(t.id) }}>
            <span className="party-face">
              {t.art
                ? <img src={`/assets/${t.art}`} alt="" />
                : <em>{initials}</em>}
            </span>
            <span className="party-meta">
              <span className="party-name">{t.name ?? 'Someone'}</span>
              <span className={`party-where ${here ? '' : 'is-away'}`}>{scene.name}</span>
            </span>
            {t.hp && (
              <span className="party-hp" aria-hidden>
                <span style={{ width: `${(t.hp.current / t.hp.max) * 100}%` }} />
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

function SceneCard({ shell, sceneId }: { shell: ShellState; sceneId: string }) {
  const { world, dm } = shell
  const scene = world.scenes.find(s => s.id === sceneId)!
  const prep = isDM(world) ? world.secrets.scenePrep[sceneId] : null
  const cues = isDM(world) ? world.secrets.sceneCues[sceneId] ?? [] : []
  const checks = isDM(world) ? world.secrets.sceneChecks[sceneId] ?? [] : []
  const options = isDM(world) ? world.secrets.sceneOptions[sceneId] ?? [] : []
  const players = dm ? dm.ir.audiences.filter(a => a.personal) : []

  const readAloud = scene.entries.filter(e => e.style === 'read')
  const rest = scene.entries.filter(e => e.style !== 'read')

  return (
    <div className="insp">
      <h2>{scene.name}</h2>

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
        <p className="empty">
          {dm ? 'No entries here yet. Add them under this scene in the campaign file.'
              : 'You have not learned anything here yet.'}
        </p>
      )}

      {options.length > 0 && (
        <section className="affordances">
          <h3>They can</h3>
          <ul>{options.map((o, i) => <li key={i}>{o}</li>)}</ul>
        </section>
      )}

      {checks.length > 0 && dm && (
        <section className="checks">
          <h3>Checks</h3>
          {checks.map(k => (
            <article key={k.id} className="check">
              <header>
                <span className="check-skill">
                  {k.skill}{k.dc !== null && (
                    <em>{dm?.ir.difficultyLabel ? ` ${dm.ir.difficultyLabel} ` : ' '}{k.dc}</em>
                  )}
                </span>
                {k.when && <span className="check-when">{k.when}</span>}
              </header>
              {k.success && <p className="check-out is-pass">{k.success}</p>}
              {k.failure && <p className="check-out is-fail">{k.failure}</p>}
              {k.reveals.length > 0 && (
                <div className="check-grant">
                  <span>on a pass, tell</span>
                  <button className="chip" onClick={() => {
                    dm.send({ t: 'reveal', audience: TABLE, targets: k.reveals })
                    dm.toast(`${k.skill} passed — shown to everyone`)
                  }}>everyone</button>
                  {players.map(pl => (
                    <button key={pl.id} className="chip" onClick={() => {
                      dm.send({ t: 'reveal', audience: pl.id as AudienceId, targets: k.reveals })
                      if (k.success) dm.send({ t: 'note', audience: pl.id as AudienceId, text: k.success })
                      dm.toast(`${k.skill} passed — told to ${pl.name} alone`)
                    }}>{pl.name}</button>
                  ))}
                </div>
              )}
            </article>
          ))}
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
    </div>
  )
}

function TokenCard({ shell, token }: { shell: ShellState; token: PublicToken }) {
  const { world, dm, setSelected } = shell
  const secret = isDM(world) ? world.secrets.tokens[token.id] : null
  const kind = dm ? findTokenKind(dm.ir, token.kind) : null
  const [narrationAt, setNarrationAt] = useState(0)

  const placement = dm?.session.placements[token.id]
  const revealed = (group: string) =>
    !dm || (dm.session.reveals[TABLE] ?? []).includes(target(token.id as EntityId, group))
  const toggle = (group: string) => dm?.send(revealed(group)
    ? { t: 'conceal', audience: TABLE, targets: [target(token.id as EntityId, group)] }
    : { t: 'reveal', audience: TABLE, targets: [target(token.id as EntityId, group)] })

  const name = token.name ?? secret?.actorName ?? 'Someone'
  const lines = secret?.narration ?? []

  return (
    <div className="insp">
      <header className="insp-head">
        <div>
          <h2>{name}</h2>
          <p className="insp-kind">{kind?.label ?? token.kind}</p>
        </div>
        {dm && placement && (
          <div className="row">
            <button className="ghost" title="Duplicate this token"
              onClick={() => {
                dm.send({
                  t: 'place', actor: placement.actor as never, scene: placement.scene as never,
                  x: Math.min(0.96, placement.x + 0.04), y: Math.min(0.96, placement.y + 0.04),
                })
                dm.toast(`Another ${secret?.actorName ?? 'token'} placed`)
              }}>duplicate</button>
            <button className="ghost danger" title="Take this token off the table"
              onClick={() => {
                dm.send({ t: 'unplace', placement: token.id as never })
                setSelected(null)
                dm.toast('Token removed. Undo puts it back.')
              }}>remove</button>
          </div>
        )}
      </header>

      {token.art && (
        <figure className="insp-portrait" style={{ ['--tok' as string]: token.accent }}>
          <img src={`/assets/${token.art}`} alt={name}
            onError={e => { (e.currentTarget.parentElement as HTMLElement).style.display = 'none' }} />
        </figure>
      )}

      {dm && secret && (
        <>
          <div className="insp-groups">
            {secret.groups.map(g => (
              <button key={g} className={`chip ${revealed(g) ? 'is-on' : ''}`}
                onClick={() => toggle(g)} title={`Show ${g} to everyone`}>
                {chipLabel(g)}
              </button>
            ))}
            {kind?.hasSecrets && (
              <span className="chip is-locked" title="This content has no public representation">
                dm only
              </span>
            )}
          </div>

        </>
      )}

      {token.hp && (
        <div className="hp">
          <div className="hp-bar">
            <span style={{ width: `${(token.hp.current / token.hp.max) * 100}%` }} />
          </div>
          {dm ? (
            <div className="hp-controls">
              <button onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current - 5 })}>&minus;5</button>
              <button onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current - 1 })}>&minus;1</button>
              <span>{token.hp.current} / {token.hp.max}</span>
              <button onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current + 1 })}>+1</button>
              <button onClick={() => dm.send({ t: 'setHp', placement: token.id as never, value: token.hp!.current + 5 })}>+5</button>
            </div>
          ) : (
            <span className="hp-count">{token.hp.current} / {token.hp.max}</span>
          )}
        </div>
      )}

      {lines.length > 0 && (
        <section className="narration">
          <h3>Read when it acts</h3>
          <p className="prose">{lines[narrationAt % lines.length]}</p>
          {lines.length > 1 && (
            <button className="ghost" onClick={() => setNarrationAt(n => n + 1)}>
              another ({(narrationAt % lines.length) + 1} of {lines.length})
            </button>
          )}
        </section>
      )}

      {secret?.stats && <StatBlockCard stats={secret.stats} />}

      {token.entries.length > 0 && (
        <div className="entries">
          {token.entries.map(e => <EntryCard key={e.id} entry={e} />)}
        </div>
      )}

      {token.entries.length === 0 && (
        <p className="empty">
          {dm ? 'Nothing revealed to the table yet.' : 'You do not know anything about this yet.'}
        </p>
      )}

      {secret && secret.entries.length > 0 && (
        <div className="entries is-secret">
          {secret.entries.map(e => <EntryCard key={e.id} entry={e} secret />)}
        </div>
      )}
      {secret?.note && <p className="truth">{secret.note}</p>}
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
