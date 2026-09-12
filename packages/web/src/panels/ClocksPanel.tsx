import { TABLE, target, type EntityId } from '@tabletop/core'
import type { ShellState } from '../shell'
import { Section, Card, Action, Hint, Empty } from '../ui/kit'

/* ------------------------------------------------------------------
   Clocks. Showing a clock reveals its presence and its track together,
   because a name without a track is a tease, not information.

   A clock is a Card: its face, its name, whether the table can see it,
   where it stands, and the newest thing it has caused. The track sits
   between the prose and the controls, which is the one slot a clock
   uses that a person does not have anything to put in.
------------------------------------------------------------------ */

export function ClocksPanel({ world, dm, selectedClock, setSelectedClock }: ShellState) {
  if (world.clocks.length === 0) return <Empty>No clocks are running.</Empty>

  /* Two groups, so the panel folds the way every other one does and a
     DM can shut the half they are not running. A player has no second
     group to shut, so they get one. */
  const seen = (k: typeof world.clocks[number]) => !dm
    || (['presence', 'track'] as const).every(g =>
      (dm.session.reveals[TABLE] ?? []).includes(target(k.id as EntityId, g)))

  const groups: [string, string, typeof world.clocks][] = dm
    ? [
      ['running', 'On every screen', world.clocks.filter(seen)],
      ['quiet', 'Still hidden', world.clocks.filter(k => !seen(k))],
    ]
    : [['running', 'Clocks', world.clocks]]

  return (
    <div className="clocks">
      {groups.filter(([, , list]) => list.length > 0).map(([id, label, list]) => (
        <Section key={id} id={`clocks:${id}`} label={label} count={list.length}
          tone={id === 'quiet' ? 'hidden' : undefined}>
          {list.map(k => {
        const ticks = k.ticks ?? 0
        /* Both halves, or it does not count: a name without a track is
           the half-revealed state an older log can hold, and calling it
           "shown" would leave the show button unable to repair it. */
        const shown = seen(k)
        const blind = !dm && k.ticks === null

        return (
          <Card key={k.id}
            title={k.name}
            tag={dm && !shown ? 'players cannot see it' : undefined}
            tagTone="hidden"
            meta={<>
              {blind
                ? <>the track is hidden</>
                : <><strong>{ticks}</strong> of <strong>{k.max}</strong> filled</>}
              {' \u00b7 '}
              {k.caption || 'no caption'}
            </>}
            body={k.latestText || undefined}
            hidden={!shown}
            active={selectedClock === k.id}
            onOpen={() => setSelectedClock(k.id)}
            openTitle={`Read ${k.name}`}
            acts={dm ? <>
              <Action on={shown} onClick={() => {
                const targets = [target(k.id as EntityId), target(k.id as EntityId, 'track')]
                dm.send(shown
                  ? { t: 'conceal', audience: TABLE, targets }
                  : { t: 'reveal', audience: TABLE, targets })
                dm.toast(shown
                  ? `${k.name} hidden from the table`
                  : `${k.name} is now on every screen`)
              }}>{shown ? 'on every screen' : 'show'}</Action>

              <div className="stepper">
                <Action disabled={ticks <= 0}
                  title={`Wind ${k.name} back a step`}
                  onClick={() => dm.send({ t: 'clockTicks', clock: k.id as never, ticks: ticks - 1 })}>
                  &minus;
                </Action>
                <span>{ticks} / {k.max}</span>
                <Action disabled={ticks >= k.max}
                  title={`Advance ${k.name} a step`}
                  onClick={() => {
                    dm.send({ t: 'clockTicks', clock: k.id as never, ticks: ticks + 1 })
                    dm.toast(shown ? `${k.name} advances` : `${k.name} advances \u2014 still hidden`)
                  }}>+</Action>
              </div>
            </> : undefined}>

            {blind ? (
              <Hint>You know this clock exists, not where it stands.</Hint>
            ) : (
              <div className="track" role="img" aria-label={`${ticks} of ${k.max}`}>
                {Array.from({ length: k.max }, (_, i) =>
                  <span key={i} className={i < ticks ? 'is-filled' : ''} />)}
              </div>
            )}
            </Card>
          )
        })}
        </Section>
      ))}
    </div>
  )
}
