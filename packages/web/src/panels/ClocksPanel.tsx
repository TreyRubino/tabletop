import { TABLE, target, type EntityId } from '@tabletop/core'
import { isDM } from '../shell'
import { Section } from '../ui/Section'
import type { ShellState } from '../shell'

/* ------------------------------------------------------------------
   The missing control that made clocks look broken: quests had a
   show/hide toggle from day one and clocks never did, so the DM could
   tick forever and no player screen would ever hear about it. Showing
   a clock reveals its presence and its track together, because a name
   without a track is a tease, not information.
------------------------------------------------------------------ */

export function ClocksPanel({ world, dm }: ShellState) {
  if (world.clocks.length === 0) return <p className="empty">No clocks are running.</p>
  const secrets = isDM(world) ? world.secrets : null

  return (
    <div className="clocks">
      {world.clocks.map(k => {
        const ticks = k.ticks ?? 0
        /* Both halves, or it does not count: a name without a track is
           the half-revealed state an older log can hold, and calling it
           "shown" would leave the show button unable to repair it. */
        const shown = !dm
          || (['presence', 'track'] as const).every(g =>
            (dm.session.reveals[TABLE] ?? []).includes(target(k.id as EntityId, g)))
        return (
          <Section key={k.id} id={`clock:${k.id}`} label={k.name}
            tone={shown ? undefined : 'hidden'}>
            {dm && (
            <header>
              <div className="row">
                {dm && (
                  <button className="ghost" onClick={() => {
                    const targets = [target(k.id as EntityId), target(k.id as EntityId, 'track')]
                    dm.send(shown
                      ? { t: 'conceal', audience: TABLE, targets }
                      : { t: 'reveal', audience: TABLE, targets })
                    dm.toast(shown
                      ? `${k.name} hidden from the table`
                      : `${k.name} is now on every screen`)
                  }}>{shown ? 'hide' : 'show'}</button>
                )}
                {dm && (
                  <div className="stepper">
                    <button disabled={ticks <= 0}
                      onClick={() => dm.send({ t: 'clockTicks', clock: k.id as never, ticks: ticks - 1 })}>
                      &minus;
                    </button>
                    <span>{ticks} / {k.max}</span>
                    <button disabled={ticks >= k.max}
                      onClick={() => {
                        dm.send({ t: 'clockTicks', clock: k.id as never, ticks: ticks + 1 })
                        dm.toast(shown ? `${k.name} advances` : `${k.name} advances \u2014 still hidden`)
                      }}>+</button>
                  </div>
                )}
              </div>
            </header>
            )}

            {dm && !shown && (
              <p className="clock-hidden-note">The players cannot see this clock yet.</p>
            )}

            {k.caption && <p className="clock-caption">{k.caption}</p>}
            {!dm && k.ticks === null ? (
              <p className="hint">The track is hidden. You know this clock exists, not where it stands.</p>
            ) : (
              <div className="track" role="img" aria-label={`${ticks} of ${k.max}`}>
                {Array.from({ length: k.max }, (_, i) =>
                  <span key={i} className={i < ticks ? 'is-filled' : ''} />)}
              </div>
            )}
            {k.latestText && <p className="prose">{k.latestText}</p>}
            {secrets?.clockNow[k.id] && <p className="truth">{secrets.clockNow[k.id]}</p>}
            {secrets?.clockNext[k.id] && <p className="next">next: {secrets.clockNext[k.id]}</p>}
          </Section>
        )
      })}
    </div>
  )
}
